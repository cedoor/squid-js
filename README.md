# 🐙 Poulpy JS

[**`poulpy-js`**](https://www.npmjs.com/package/poulpy-js) is a JavaScript library for browser-usable FHE, built on [Poulpy](https://github.com/poulpy-fhe/poulpy) via [Squid](https://github.com/cedoor/squid) (an ergonomic Rust wrapper). It ships a WebAssembly client (`poulpy-js/client`) and a napi-rs Node evaluator (`poulpy-js/server`) — see [packages/poulpy-js/README.md](./packages/poulpy-js/README.md) for install and API docs.

This repo is the Cargo + pnpm monorepo that builds the library, plus a client/server demo showing it end-to-end: the browser generates its own `(secret_key, evaluation_key)` pair, ships only the evaluation key and ciphertexts to the server, and decrypts results locally. The server never sees plaintexts and never holds secret-key material.

```
poulpy-js/
├─ Cargo.toml                  # Rust workspace
├─ pnpm-workspace.yaml
├─ package.json                # root scripts
├─ crates/
│  ├─ poulpy-wasm/             # wasm-bindgen bindings (browser)
│  ├─ poulpy-napi/             # napi-rs bindings (Node server)
│  └─ criterion-shim/          # no-op `criterion` replacement; see below
├─ packages/
│  └─ poulpy-js/               # dual entry point:
│                              #   `poulpy-js/client` (browser, wasm worker + PoulpyClient)
│                              #   `poulpy-js/server` (Node, napi-backed Evaluator)
└─ apps/
   ├─ client/                  # Vite + React demo
   ├─ server/                  # Node + Express demo
   └─ e2e/                     # Playwright end-to-end tests
```

## Prerequisites

- Rust nightly (pinned in `rust-toolchain.toml`), with the `wasm32-unknown-unknown` target
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) (`cargo install wasm-pack`)
- Node.js 20+ and pnpm 9+

## Build

```sh
pnpm install
pnpm build          # build:poulpy (wasm + napi + ts) → build:server → build:client
pnpm dev            # server on :3001, client on :5173
pnpm test           # Playwright: installs Chromium (pretest), runs demo flow
```

Individual steps are also available (`pnpm build:poulpy`, `pnpm build:server`, `pnpm build:client`). `build:poulpy` compiles the wasm crate via `wasm-pack`, the napi crate via `@napi-rs/cli`, and the TS wrappers via `tsc` — all into `packages/poulpy-js/`.

### CI

GitHub Actions (`.github/workflows/e2e.yml`) runs `pnpm install`, `pnpm build`, and `pnpm test` on pushes and pull requests to `main` / `master`.

## How it works

1. **Browser.** `PoulpyClient.create({ paramsSet })` spins up a module worker that loads wasm and calls `Session::new_random(paramsSet)`. Squid resolves the name with `Params::by_name` (e.g. `"test"` or `"unsecure"`), then `Context::keygen_with_seeds` runs under that parameter set. The client exposes `evaluationKey` plus async `encryptU32`, `decryptU32`, and `exportSeeds` (all in the worker). The same `paramsSet` must be used on the server (`POULPY_PARAMS_SET` in the demo).
2. **Client → server handshake.** The browser POSTs raw evaluation-key bytes (`Content-Type: application/octet-stream`) to `POST /session`. The server deserializes into a `poulpy_napi::Evaluator` and stores it in an in-memory `Map` keyed by a UUID.
3. **Compute.** The browser POSTs packed ciphertext bytes to `POST /session/:id/add`. The server deserializes both, runs homomorphic add, and returns the serialized result ciphertext.
4. **Decrypt.** Browser `await`s `client.decryptU32(result)`; secret-key material never leaves the worker/page.

## Why `crates/criterion-shim`?

Poulpy 0.5.0 declares `criterion` in `[dependencies]` (not `[dev-dependencies]`), and several library modules import `criterion::{Criterion, BenchmarkId}` for `pub fn bench_*` helpers. Real criterion transitively depends on `rayon`, which does not compile on `wasm32-unknown-unknown`.

The shim crate provides the exact subset of the 0.8 API Poulpy's library surface touches, as no-ops. Poulpy's `bench_*` helpers type-check but are never called on our hot path, so the bodies never run. Workspace `[patch.crates-io]` redirects `criterion` to the shim for every target.

When upstream Poulpy moves criterion to `[dev-dependencies]`, delete the shim and the patch entry.

## Known constraints

- **Parameter sets** — `paramsSet` is a Squid name (currently `"test"` or `"unsecure"`). The demo defaults to `"test"`; that set uses the same layout bundle as Poulpy’s `bdd_arithmetic` **test_suite** and is smaller/faster than `"unsecure"`. Neither is a vetted production security level.
- Sessions are in-memory and unauthenticated (single-process demo only).
- Keygen runs in the wasm worker until it finishes; the demo UI stays on “Booting wasm…” until the worker reports ready (the main thread stays responsive).
