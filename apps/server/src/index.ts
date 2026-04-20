import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { Evaluator } from "@squid-js/napi";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const MAX_BODY = process.env.MAX_BODY ?? "512mb";
const OCTET_STREAM = "application/octet-stream";

const sessions = new Map<string, Evaluator>();

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

const rawBody = express.raw({ type: OCTET_STREAM, limit: MAX_BODY });

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, sessions: sessions.size });
});

app.post("/session", rawBody, (req: Request, res: Response) => {
  const ek = req.body as Buffer;
  if (!Buffer.isBuffer(ek) || ek.length === 0) {
    res.status(400).json({ error: `expected ${OCTET_STREAM} body with evaluation key bytes` });
    return;
  }
  let evaluator: Evaluator;
  try {
    evaluator = Evaluator.load(ek);
  } catch (err) {
    res.status(400).json({ error: `invalid evaluation key: ${(err as Error).message}` });
    return;
  }
  const sessionId = randomUUID();
  sessions.set(sessionId, evaluator);
  res.json({ sessionId });
});

// Body layout: u32-le(aLen) || a-bytes || b-bytes. Response is the serialized
// ciphertext as raw application/octet-stream.
app.post("/session/:id/add", rawBody, (req: Request, res: Response) => {
  const evaluator = sessions.get(req.params.id);
  if (!evaluator) {
    res.status(404).json({ error: "unknown sessionId" });
    return;
  }
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length < 4) {
    res.status(400).json({ error: "body must be u32-le(a_len) || a || b" });
    return;
  }
  const aLen = body.readUInt32LE(0);
  if (4 + aLen > body.length) {
    res.status(400).json({ error: "a_len overruns body" });
    return;
  }
  const a = body.subarray(4, 4 + aLen);
  const b = body.subarray(4 + aLen);
  try {
    const out = evaluator.addU32(a, b);
    res.setHeader("Content-Type", OCTET_STREAM);
    res.send(out);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.delete("/session/:id", (req: Request, res: Response) => {
  sessions.delete(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[squid-js server] listening on http://localhost:${PORT}`);
  console.log(`[squid-js server] accepting CORS from ${CLIENT_ORIGIN}`);
});
