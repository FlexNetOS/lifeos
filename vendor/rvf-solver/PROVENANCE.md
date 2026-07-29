# Why `@ruvector/rvf-solver` is vendored

This directory is **not** a fork of the ruvnet solver. The TypeScript layer is
byte-identical to the published package; only the WebAssembly binary differs,
and it differs because the published binary is broken.

## Measurement

Same call on both artifacts — `acceptance({ holdoutSize: 30,
trainingPerCycle: 200, cycles: 5, stepBudget: 500, seed: 7 })`:

| | this build | published `0.1.8` |
| --- | --- | --- |
| `allPassed` | **true** | false |
| `modeA.passed` | **true** | false |
| `modeC.passed` | **true** | false |
| modeA accuracy, every cycle | **1.0** | 0.4667 |
| modeA cost per solve | **93.8** | 182.57 |
| witness entries | 15 | 15 |

The published artifact learns — `patterns_learned` climbs 91 → 396 across the
five cycles — but accuracy, cost and noise-robustness never move, so
`accuracy_maintained`, `cost_improved` and `robustness_improved` all come back
false. It fails its own acceptance gate.

## Where the difference is

Everything except the wasm is identical to `@ruvector/rvf-solver@0.1.8`:

| file | published | here |
| --- | --- | --- |
| `dist/index.js` | 7248 B | identical |
| `dist/solver.js` | 7248 B | identical |
| `pkg/rvf_solver.js` | 1983 B | identical |
| `pkg/rvf_solver_bg.wasm` | 135 500 B | **171 836 B** |

Same Rust source too: `crates/rvf/rvf-solver-wasm` in the meta-ruvector fork
differs from `upstream/main` by 11 lines — a `Cargo.toml` trim and the
`#[cfg(all(not(test), target_arch = "wasm32"))]` panic-handler gate from
`c68d05bbd`. Neither can move solver accuracy.

The remaining difference is the build pipeline. Upstream's `build:wasm` script
is:

```
cargo build --release --target wasm32-unknown-unknown ...
  && wasm-opt -Oz <in> -o pkg/rvf_solver_bg.wasm
```

This build omits `wasm-opt -Oz`, which accounts for the binary being ~36 KB
larger. The evidence points at that size-optimisation pass degrading the
solver: identical source, identical JS, and the `-Oz` output is the one that
scores 0.4667. Not yet proven directly — `wasm-opt` is not on PATH on this
host, so the `-Oz` build has not been reproduced here to confirm it in
isolation.

## Consequences

- **Do not replace this with the published package.** Doing so drops solver
  accuracy from 1.0 to 0.4667 and makes
  `scripts/verify-rvf-solver-artifact.mjs` fail its acceptance gate. That is a
  downgrade, not a de-forking.
- The `overrides` entry in the root `package.json` is required, not cosmetic:
  `@ruvector/rvf` declares `@ruvector/rvf-solver: ^0.1.0` as an optional
  dependency, and a prerelease version such as `0.1.8-lifeos.2` does not
  satisfy a `^0.1.0` range under semver. Without the override the resolver
  silently installs the broken published artifact.
- `scripts/verify-rvf-solver-artifact.mjs` pins this wasm by SHA-256. If the
  wasm is ever rebuilt, update that pin in the same commit.
- **This should go upstream.** The fix belongs in ruvnet's release pipeline
  (drop or weaken `-Oz` for this crate, or add the acceptance gate to CI so a
  bad `-Oz` build cannot publish). Until it does, this directory is the
  workaround.

## Rebuilding

```bash
cd /home/flexnetos/meta/src/meta-ruvector
cargo build --release --target wasm32-unknown-unknown \
  --manifest-path crates/rvf/rvf-solver-wasm/Cargo.toml
# copy the .wasm to pkg/rvf_solver_bg.wasm WITHOUT running wasm-opt -Oz
```

The `dist/` TypeScript output can be taken from the published package, since it
is byte-identical, or rebuilt with `tsc` from
`meta-ruvector/npm/packages/rvf-solver/src`.
