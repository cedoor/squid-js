'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { FheState, LogEntry, LogKind, Phase } from '@/lib/fhe-types'
import { formatBytes, packCiphertexts } from '@/lib/pack'

const API_BASE = '/api'
const PARAMS_SET =
  (process.env.NEXT_PUBLIC_POULPY_PARAMS_SET as string | undefined) ?? 'test'
const OCTET = 'application/octet-stream'
/** Vercel (and most serverless) cap ~4.5 MiB per request; EK is often much larger. */
const EK_UPLOAD_CHUNK = 3 * 1024 * 1024

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type Action =
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'KEYGEN_DONE'; skPreview: Uint8Array; ekBytes: Uint8Array; sessionId: string }
  | { type: 'ENCRYPT_DONE'; ctA: Uint8Array; ctB: Uint8Array }
  | { type: 'EVALUATE_DONE'; ctSum: Uint8Array }
  | { type: 'DECRYPT_DONE'; result: number }
  | { type: 'SET_A'; a: number }
  | { type: 'SET_B'; b: number }
  | { type: 'LOG'; entry: LogEntry }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' }

const initial: FheState = {
  phase: 'idle',
  skPreview: null,
  ekBytes: null,
  sessionId: null,
  a: 7,
  b: 5,
  ctA: null,
  ctB: null,
  ctSum: null,
  result: null,
  logs: [],
  error: null,
}

function reducer(state: FheState, action: Action): FheState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase, error: null }
    case 'KEYGEN_DONE':
      return {
        ...state,
        phase: 'idle',
        skPreview: action.skPreview,
        ekBytes: action.ekBytes,
        sessionId: action.sessionId,
        ctA: null,
        ctB: null,
        ctSum: null,
        result: null,
        error: null,
      }
    case 'ENCRYPT_DONE':
      return { ...state, phase: 'idle', ctA: action.ctA, ctB: action.ctB, ctSum: null, result: null, error: null }
    case 'EVALUATE_DONE':
      return { ...state, phase: 'idle', ctSum: action.ctSum, result: null, error: null }
    case 'DECRYPT_DONE':
      return { ...state, phase: 'idle', result: action.result, error: null }
    case 'SET_A':
      return { ...state, a: action.a, ctA: null, ctB: null, ctSum: null, result: null }
    case 'SET_B':
      return { ...state, b: action.b, ctA: null, ctB: null, ctSum: null, result: null }
    case 'LOG':
      return { ...state, logs: [...state.logs, action.entry] }
    case 'ERROR':
      return { ...state, phase: 'idle', error: action.message }
    case 'RESET':
      return { ...initial, logs: [] }
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFhe() {
  const [state, dispatch] = useReducer(reducer, initial)
  const clientRef = useRef<import('poulpy-js/client').PoulpyClient | null>(null)
  const logIdRef = useRef(0)
  const startRef = useRef(Date.now())

  const log = useCallback((kind: LogKind, text: string) => {
    const elapsed = (Date.now() - startRef.current) / 1000
    dispatch({
      type: 'LOG',
      entry: { id: logIdRef.current++, ts: elapsed.toFixed(2) + 's', kind, text },
    })
  }, [])

  const doKeygen = useCallback(async () => {
    dispatch({ type: 'SET_PHASE', phase: 'keygen' })
    startRef.current = Date.now()
    logIdRef.current = 0
    log('info', 'client: generating CGGI keypair…')
    log('dim', `  scheme=CGGI  paramsSet=${PARAMS_SET}`)
    try {
      const { PoulpyClient } = await import('poulpy-js/client')
      const client = await PoulpyClient.create({ paramsSet: PARAMS_SET })
      clientRef.current = client

      const seeds = await client.exportSeeds()
      const skPreview = seeds.slice(0, 48)
      const ekBytes = client.evaluationKey

      log('ok', `client: sk ready (${formatBytes(seeds.byteLength)}) — stays local`)
      log('info', `client: uploading ek (${formatBytes(ekBytes.byteLength)}) to server…`)

      const { sessionId } = await (async () => {
        if (ekBytes.byteLength <= EK_UPLOAD_CHUNK) {
          const resp = await fetch(`${API_BASE}/session`, {
            method: 'POST',
            headers: { 'Content-Type': OCTET },
            body: ekBytes as BodyInit,
          })
          if (!resp.ok) throw new Error(`session upload failed (${resp.status})`)
          return (await resp.json()) as { sessionId: string }
        }
        const uploadId = crypto.randomUUID()
        const n = Math.ceil(ekBytes.byteLength / EK_UPLOAD_CHUNK)
        log('dim', `  (chunked: ${n}×${formatBytes(EK_UPLOAD_CHUNK)} max; serverless body limit)`)
        for (let i = 0; i < n; i++) {
          const start = i * EK_UPLOAD_CHUNK
          const chunk = ekBytes.subarray(
            start,
            start + Math.min(EK_UPLOAD_CHUNK, ekBytes.byteLength - start),
          )
          const resp = await fetch(`${API_BASE}/session`, {
            method: 'POST',
            headers: {
              'Content-Type': OCTET,
              'X-Upload-Id': uploadId,
              'X-Chunk-Index': String(i),
              'X-Total-Chunks': String(n),
            },
            body: chunk as BodyInit,
          })
          if (i < n - 1) {
            if (resp.status !== 202) throw new Error(`session upload failed (${resp.status})`)
          } else {
            if (!resp.ok) throw new Error(`session upload failed (${resp.status})`)
            return (await resp.json()) as { sessionId: string }
          }
        }
        throw new Error('session upload: internal chunk loop')
      })()

      log('ok', `client: ek uploaded · sessionId=${sessionId.slice(0, 8)}…`)
      log('dim', 'server: waiting for ciphertexts…')

      dispatch({ type: 'KEYGEN_DONE', skPreview, ekBytes, sessionId })
    } catch (err) {
      log('err', `client: keygen failed — ${(err as Error).message}`)
      dispatch({ type: 'ERROR', message: (err as Error).message })
    }
  }, [log])

  const doEncrypt = useCallback(
    async (a: number, b: number) => {
      const client = clientRef.current
      if (!client) return
      dispatch({ type: 'SET_PHASE', phase: 'encrypting' })
      log('info', `client: encrypting a=${a}`)
      try {
        const ctA = await client.encryptU32(a)
        log('ok', `client: ctₐ ready (${formatBytes(ctA.byteLength)})`)
        log('info', `client: encrypting b=${b}`)
        const ctB = await client.encryptU32(b)
        log('ok', `client: ct_b ready (${formatBytes(ctB.byteLength)})`)
        dispatch({ type: 'ENCRYPT_DONE', ctA, ctB })
      } catch (err) {
        log('err', `client: encrypt failed — ${(err as Error).message}`)
        dispatch({ type: 'ERROR', message: (err as Error).message })
      }
    },
    [log],
  )

  const doEvaluate = useCallback(
    async (ctA: Uint8Array, ctB: Uint8Array, sessionId: string, ekBytes: Uint8Array) => {
      dispatch({ type: 'SET_PHASE', phase: 'sending' })
      const payloadSize = formatBytes(ekBytes.byteLength + ctA.byteLength + ctB.byteLength)
      log('info', `client → server: POST /session/${sessionId.slice(0, 8)}…/add (${payloadSize})`)
      try {
        const body = packCiphertexts(ctA, ctB)
        dispatch({ type: 'SET_PHASE', phase: 'evaluating' })
        log('in', 'server: received ciphertexts, computing ctₐ ⊞ ct_b')
        const resp = await fetch(`${API_BASE}/session/${sessionId}/add`, {
          method: 'POST',
          headers: { 'Content-Type': OCTET },
          body: body as BodyInit,
        })
        if (!resp.ok) {
          const body2 = (await resp.json().catch(() => ({}))) as { error?: string }
          throw new Error(body2.error ?? `/add failed (${resp.status})`)
        }
        const ctSum = new Uint8Array(await resp.arrayBuffer())
        log('ok', `server: ct_sum ready (${formatBytes(ctSum.byteLength)})`)
        log('out', 'server → client: 200 OK')
        dispatch({ type: 'EVALUATE_DONE', ctSum })
      } catch (err) {
        log('err', `evaluate failed — ${(err as Error).message}`)
        dispatch({ type: 'ERROR', message: (err as Error).message })
      }
    },
    [log],
  )

  const doDecrypt = useCallback(
    async (ctSum: Uint8Array) => {
      const client = clientRef.current
      if (!client) return
      dispatch({ type: 'SET_PHASE', phase: 'decrypting' })
      log('info', 'client: Dec(sk, ct_sum)…')
      try {
        const result = await client.decryptU32(ctSum)
        log('ok', `client: plaintext = ${result}`)
        dispatch({ type: 'DECRYPT_DONE', result })
      } catch (err) {
        log('err', `client: decrypt failed — ${(err as Error).message}`)
        dispatch({ type: 'ERROR', message: (err as Error).message })
      }
    },
    [log],
  )

  const doReset = useCallback(() => {
    clientRef.current = null
    dispatch({ type: 'RESET' })
  }, [])

  const setA = useCallback((a: number) => dispatch({ type: 'SET_A', a }), [])
  const setB = useCallback((b: number) => dispatch({ type: 'SET_B', b }), [])

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      clientRef.current = null
    }
  }, [])

  return {
    state,
    doKeygen,
    doEncrypt,
    doEvaluate,
    doDecrypt,
    doReset,
    setA,
    setB,
  }
}
