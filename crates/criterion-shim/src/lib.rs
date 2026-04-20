//! No-op shim for the subset of the `criterion 0.8` API that Poulpy's
//! library crates touch from non-bench code paths.
//!
//! Real criterion transitively depends on `rayon`, which hard-errors on
//! `wasm32-unknown-unknown`. Poulpy declares `criterion` in `[dependencies]`
//! (not `[dev-dependencies]`) and references the types in `pub fn bench_*`
//! helpers inside library modules — so the names have to resolve at compile
//! time. They are never *called* in the squid path we drive, so these
//! implementations never execute; unreachable panics are fine.

#![allow(clippy::needless_lifetimes, clippy::new_without_default)]

use std::fmt::Display;
use std::marker::PhantomData;

pub mod measurement {
    /// `WallTime` is the default measurement type. We only need the name for
    /// explicit `BenchmarkGroup<'_, WallTime>` references in Poulpy.
    pub struct WallTime;
}

pub struct Criterion<M = measurement::WallTime> {
    _m: PhantomData<fn() -> M>,
}

impl<M> Default for Criterion<M> {
    fn default() -> Self {
        Self { _m: PhantomData }
    }
}

impl<M> Criterion<M> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn benchmark_group<S: Into<String>>(&mut self, _name: S) -> BenchmarkGroup<'_, M> {
        BenchmarkGroup {
            _c: self,
            _m: PhantomData,
        }
    }
}

pub struct BenchmarkGroup<'a, M> {
    _c: &'a mut Criterion<M>,
    _m: PhantomData<fn() -> M>,
}

impl<'a, M> BenchmarkGroup<'a, M> {
    pub fn bench_with_input<I, F>(&mut self, _id: BenchmarkId, _input: &I, _f: F)
    where
        F: FnMut(&mut Bencher, &I),
    {
    }

    pub fn finish(self) {}
}

pub struct BenchmarkId;

impl BenchmarkId {
    pub fn from_parameter<T: Display>(_: T) -> Self {
        BenchmarkId
    }

    pub fn new<S: Display, T: Display>(_: S, _: T) -> Self {
        BenchmarkId
    }
}

pub struct Bencher;

impl Bencher {
    pub fn iter<R, F>(&mut self, mut _routine: F)
    where
        F: FnMut() -> R,
    {
    }
}

#[macro_export]
macro_rules! criterion_group {
    ($($tt:tt)*) => {};
}

#[macro_export]
macro_rules! criterion_main {
    ($($tt:tt)*) => {
        fn main() {}
    };
}
