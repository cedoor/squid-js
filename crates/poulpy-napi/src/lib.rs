//! napi-rs bindings over `squid` for server-side evaluation.
//!
//! The server only knows how to load an `EvaluationKey` and run ops on
//! serialized ciphertexts. It never holds any secret key material.

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use squid::{Context, EvaluationKey, Params};

#[napi]
pub struct Evaluator {
    ctx: Context,
    ek: EvaluationKey,
}

#[napi]
impl Evaluator {
    /// Rebuild a `Context` under `Params::test()` and load the
    /// serialized evaluation key produced by the browser client.
    #[napi(factory)]
    pub fn load(ek_bytes: Buffer) -> Result<Self> {
        let mut ctx = Context::new(Params::test());
        let ek = ctx
            .deserialize_evaluation_key(ek_bytes.as_ref())
            .map_err(io_err)?;
        Ok(Self { ctx, ek })
    }

    /// Homomorphic `a + b` over serialized `u32` ciphertexts. Returns the
    /// serialized result.
    #[napi]
    pub fn add_u32(&mut self, a: Buffer, b: Buffer) -> Result<Buffer> {
        let a_ct = self
            .ctx
            .deserialize_ciphertext::<u32>(a.as_ref())
            .map_err(io_err)?;
        let b_ct = self
            .ctx
            .deserialize_ciphertext::<u32>(b.as_ref())
            .map_err(io_err)?;
        let c = self.ctx.add(&a_ct, &b_ct, &self.ek);
        let out = c.serialize().map_err(io_err)?;
        Ok(out.into())
    }
}

fn io_err(e: std::io::Error) -> Error {
    Error::from_reason(e.to_string())
}
