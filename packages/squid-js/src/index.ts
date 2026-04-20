import initWasm, { Session } from "../wasm/squid_wasm.js";

let initPromise: Promise<void> | null = null;

/**
 * Initialize the underlying wasm module. Safe to call repeatedly; the
 * returned promise is memoized.
 *
 * Pass a custom `wasmUrl` to override the default (sibling `.wasm` file
 * resolved relative to the generated JS glue).
 */
export async function init(wasmUrl?: string | URL | Request): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await initWasm(wasmUrl ? { module_or_path: wasmUrl } : undefined);
    })();
  }
  return initPromise;
}

export interface CreateOptions {
  seeds?: Uint8Array;
}

/**
 * Ergonomic client over the wasm `Session`. The secret key never leaves
 * this object; only the evaluation key bytes and per-value ciphertexts
 * cross process/network boundaries.
 */
export class SquidClient {
  readonly evaluationKey: Uint8Array;
  private readonly session: Session;

  private constructor(session: Session, ek: Uint8Array) {
    this.session = session;
    this.evaluationKey = ek;
  }

  static async create(opts: CreateOptions = {}): Promise<SquidClient> {
    await init();
    const session = opts.seeds
      ? Session.fromSeeds(opts.seeds)
      : Session.newRandom();
    const ek = session.evaluationKeyBytes();
    return new SquidClient(session, ek);
  }

  encryptU32(value: number): Uint8Array {
    if (!Number.isInteger(value) || value < 0 || value > 0xff_ff_ff_ff) {
      throw new RangeError(`encryptU32: ${value} is out of u32 range`);
    }
    return this.session.encryptU32(value);
  }

  decryptU32(ciphertext: Uint8Array): number {
    return this.session.decryptU32(ciphertext);
  }

  /** 96-byte `lattice || bdd_mask || bdd_noise` blob for optional persistence. */
  exportSeeds(): Uint8Array {
    return this.session.seeds();
  }
}

export { Session };
