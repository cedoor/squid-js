import { useEffect, useMemo, useState } from "react";
import { PoulpyClient } from "poulpy-js/client";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "http://localhost:3001";
const POULPY_PARAMS_SET = (import.meta.env.POULPY_PARAMS_SET as string | undefined) ?? "test";
const OCTET_STREAM = "application/octet-stream";

type Status =
  | { kind: "booting" }
  | { kind: "ready" }
  | { kind: "computing" }
  | { kind: "error"; message: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

// Pack two ciphertexts as u32-le(a.length) || a || b. Avoids base64 on the
// wire entirely so we don't pay a 33% size tax (and don't have to allocate
// huge intermediate strings for multi-MB buffers).
function packCiphertexts(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + a.length + b.length);
  new DataView(out.buffer).setUint32(0, a.length, true);
  out.set(a, 4);
  out.set(b, 4 + a.length);
  return out;
}

export function App() {
  const [client, setClient] = useState<PoulpyClient | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "booting" });
  const [a, setA] = useState("17");
  const [b, setB] = useState("25");
  const [result, setResult] = useState<number | null>(null);
  const [lastCtSize, setLastCtSize] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await PoulpyClient.create({ paramsSet: POULPY_PARAMS_SET });
        if (cancelled) return;
        const resp = await fetch(`${SERVER_URL}/session`, {
          method: "POST",
          headers: { "Content-Type": OCTET_STREAM },
          // cast: the wasm-bindgen .d.ts uses a broader Uint8Array generic than
          // TS 5.7's BodyInit wants, but at runtime this is the same bytes.
          body: c.evaluationKey as BodyInit,
        });
        if (!resp.ok) throw new Error(`session upload failed (${resp.status})`);
        const { sessionId } = (await resp.json()) as { sessionId: string };
        if (cancelled) return;
        setClient(c);
        setSessionId(sessionId);
        setStatus({ kind: "ready" });
      } catch (err) {
        if (!cancelled) setStatus({ kind: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ekSize = useMemo(() => (client ? client.evaluationKey.byteLength : 0), [client]);

  async function compute() {
    if (!client || !sessionId) return;
    const aN = Number(a);
    const bN = Number(b);
    if (!Number.isInteger(aN) || !Number.isInteger(bN) || aN < 0 || bN < 0) {
      setStatus({ kind: "error", message: "inputs must be non-negative u32 integers" });
      return;
    }
    setStatus({ kind: "computing" });
    setResult(null);
    try {
      const ctA = await client.encryptU32(aN);
      const ctB = await client.encryptU32(bN);
      setLastCtSize(ctA.byteLength);
      const resp = await fetch(`${SERVER_URL}/session/${sessionId}/add`, {
        method: "POST",
        headers: { "Content-Type": OCTET_STREAM },
        body: packCiphertexts(ctA, ctB) as BodyInit,
      });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `/add failed (${resp.status})`);
      }
      const resultBytes = new Uint8Array(await resp.arrayBuffer());
      const decrypted = await client.decryptU32(resultBytes);
      setResult(decrypted);
      setStatus({ kind: "ready" });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }

  const busy = status.kind === "booting" || status.kind === "computing";

  return (
    <main>
      <header>
        <h1>poulpy-js FHE demo</h1>
        <p className="muted">
          Browser generates keys, encrypts inputs, ships ciphertext to the server. The server
          never sees plaintexts and cannot decrypt the result.
        </p>
      </header>

      <section className="card">
        <div className="row">
          <label>
            a
            <input
              type="number"
              min={0}
              value={a}
              onChange={(e) => setA(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            b
            <input
              type="number"
              min={0}
              value={b}
              onChange={(e) => setB(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <button onClick={compute} disabled={busy || !sessionId}>
            {status.kind === "booting" && "Booting wasm…"}
            {status.kind === "computing" && "Computing on server…"}
            {status.kind === "ready" && "Compute a + b on server"}
            {status.kind === "error" && "Retry"}
          </button>
        </div>
      </section>

      {status.kind === "error" && (
        <div className="card error">
          <strong>Error.</strong> {status.message}
        </div>
      )}

      <section className="card">
        <div className="stats">
          <span className="muted">Evaluation key size</span>
          <code>{ekSize ? formatBytes(ekSize) : "—"}</code>
          <span className="muted">Ciphertext size (last)</span>
          <code>{lastCtSize ? formatBytes(lastCtSize) : "—"}</code>
          <span className="muted">Session id</span>
          <code>{sessionId ?? "—"}</code>
          <span className="muted">Decrypted result</span>
          <span className="result">{result ?? "—"}</span>
        </div>
      </section>
    </main>
  );
}
