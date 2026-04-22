// Partial evaluation-key uploads (Vercel max body ~4.5 MiB; EK is often tens of MiB).
declare global {
  // eslint-disable-next-line no-var
  var __poulpyPendingEk: Map<string, PendingEk> | undefined
  // eslint-disable-next-line no-var
  var __poulpyPendingEkTimeouts: Map<string, ReturnType<typeof setTimeout>> | undefined
}

const UPLOAD_TTL_MS = 10 * 60_000

type PendingEk = {
  totalChunks: number
  parts: (Buffer | undefined)[]
  received: number
}

export const pendingEkUploads: Map<string, PendingEk> =
  globalThis.__poulpyPendingEk ?? (globalThis.__poulpyPendingEk = new Map())

const uploadTimeouts: Map<string, ReturnType<typeof setTimeout>> =
  globalThis.__poulpyPendingEkTimeouts ?? (globalThis.__poulpyPendingEkTimeouts = new Map())

function touchTimeout(uploadId: string) {
  const prev = uploadTimeouts.get(uploadId)
  if (prev) clearTimeout(prev)
  const t = setTimeout(() => {
    pendingEkUploads.delete(uploadId)
    uploadTimeouts.delete(uploadId)
  }, UPLOAD_TTL_MS)
  uploadTimeouts.set(uploadId, t)
}

export function applyEkChunk(
  uploadId: string,
  chunkIndex: number,
  totalChunks: number,
  data: Buffer,
):
  | { done: true; full: Buffer }
  | { done: false; received: number; total: number } {
  touchTimeout(uploadId)
  if (totalChunks < 1 || chunkIndex < 0 || chunkIndex >= totalChunks) {
    throw new Error('invalid chunk range')
  }
  let pending = pendingEkUploads.get(uploadId)
  if (!pending) {
    pending = {
      totalChunks,
      parts: new Array<Buffer | undefined>(totalChunks),
      received: 0,
    }
    pendingEkUploads.set(uploadId, pending)
  } else if (pending.totalChunks !== totalChunks) {
    throw new Error('totalChunks mismatch for uploadId')
  }
  if (pending.parts[chunkIndex] === undefined) {
    pending.received += 1
  }
  pending.parts[chunkIndex] = data
  if (pending.received < totalChunks) {
    return { done: false, received: pending.received, total: totalChunks }
  }
  for (const p of pending.parts) {
    if (p === undefined) throw new Error('missing chunk in pending buffer')
  }
  pendingEkUploads.delete(uploadId)
  const t = uploadTimeouts.get(uploadId)
  if (t) {
    clearTimeout(t)
    uploadTimeouts.delete(uploadId)
  }
  const full = Buffer.concat(pending.parts as Buffer[])
  return { done: true, full }
}
