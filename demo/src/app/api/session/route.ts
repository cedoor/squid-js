import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Evaluator } from 'poulpy-js/server'
import { applyEkChunk } from '@/lib/pending-ek-uploads'
import { sessions } from '@/lib/sessions'

const PARAMS_SET = process.env.POULPY_PARAMS_SET ?? 'test'

const HDR_UPLOAD = 'x-upload-id'
const HDR_INDEX = 'x-chunk-index'
const HDR_TOTAL = 'x-total-chunks'

function loadEvaluatorOr400(body: Buffer) {
  try {
    return Evaluator.load(body, PARAMS_SET)
  } catch (err) {
    return NextResponse.json(
      { error: `invalid evaluation key: ${(err as Error).message}` },
      { status: 400 },
    )
  }
}

export async function POST(req: NextRequest) {
  const body = Buffer.from(await req.arrayBuffer())
  if (!body.byteLength) {
    return NextResponse.json({ error: 'expected binary evaluation key body' }, { status: 400 })
  }

  const uploadId = req.headers.get(HDR_UPLOAD)
  const chunkIndexRaw = req.headers.get(HDR_INDEX)
  const totalChunksRaw = req.headers.get(HDR_TOTAL)
  const hasChunking = uploadId && chunkIndexRaw !== null && totalChunksRaw !== null

  if (hasChunking) {
    const chunkIndex = parseInt(chunkIndexRaw, 10)
    const totalChunks = parseInt(totalChunksRaw, 10)
    if (Number.isNaN(chunkIndex) || Number.isNaN(totalChunks) || !uploadId) {
      return NextResponse.json({ error: 'invalid chunk headers' }, { status: 400 })
    }
    let step
    try {
      step = applyEkChunk(uploadId, chunkIndex, totalChunks, body)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }
    if (!step.done) {
      return NextResponse.json(
        { ok: true, received: step.received, total: step.total, complete: false },
        { status: 202 },
      )
    }
    const ev = loadEvaluatorOr400(step.full)
    if (ev instanceof NextResponse) return ev
    const sessionId = randomUUID()
    sessions.set(sessionId, ev)
    return NextResponse.json({ sessionId, complete: true })
  }

  if (uploadId || chunkIndexRaw !== null || totalChunksRaw !== null) {
    return NextResponse.json(
      { error: 'chunk headers require all of x-upload-id, x-chunk-index, x-total-chunks' },
      { status: 400 },
    )
  }

  const ev2 = loadEvaluatorOr400(body)
  if (ev2 instanceof NextResponse) return ev2
  const sessionId = randomUUID()
  sessions.set(sessionId, ev2)
  return NextResponse.json({ sessionId })
}
