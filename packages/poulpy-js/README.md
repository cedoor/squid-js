# Poulpy JS

JavaScript bindings for [Poulpy](https://github.com/poulpy-fhe/poulpy) FHE: a **browser** client (WebAssembly in a dedicated worker so keygen and crypto stay off the UI thread) and a **Node** evaluator (napi-rs). The client holds the secret key; the server only receives the evaluation key and ciphertexts.

## Install

```sh
npm install poulpy-js
```

Use `pnpm add poulpy-js` or `yarn add poulpy-js` if you prefer. The server entry point ships a native addon; install on the platform you run Node on.

## Usage

**Browser** — import `poulpy-js/client`:

```ts
import { PoulpyClient } from "poulpy-js/client";

const client = await PoulpyClient.create({ paramsSet: "test" }); // or "unsecure" — must match the server
const ct = await client.encryptU32(42);
// Send `client.evaluationKey` and `ct` to the server; decrypt results with `await client.decryptU32(...)`.
```

**Node** — import `poulpy-js/server` (native addon; not for bundlers targeting the browser):

```ts
import { Evaluator } from "poulpy-js/server";

const ev = Evaluator.load(evaluationKeyBytes, "test");
const sum = ev.addU32(ctA, ctB);
```

The `./wasm/*` export serves the built `.wasm` assets for hosting or custom `init()` URLs. Call `init()` only if you use the wasm `Session` on the main thread (no `Worker`); otherwise wasm loads inside the worker when you call `PoulpyClient.create()`.

## Build

Requires Rust (`wasm-pack`), and for the server target, a normal napi build environment.

```sh
pnpm run build
```

This runs `build:wasm`, `build:napi`, and `build:ts` in order (emitting `dist/poulpy-worker.js` next to `dist/client.js`). Node **≥ 20** is required.
