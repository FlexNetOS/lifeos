# CodeDB fixture workspace

This directory contains small, deterministic inputs for exercising CodeDB's
Rust and Nushell discovery. Each fixture is intentionally independent; there
is no top-level Cargo workspace.

| Fixture | Purpose |
| --- | --- |
| `single_simple_crate` | Minimal Rust library |
| `workspace_two_crates` | Cargo workspace and path dependency |
| `build_script` | Package build script and `cargo:rerun-if-changed` |
| `out_dir_generator` | Source generated into `OUT_DIR` and included by Rust |
| `proc_macro_consumer` | Local procedural-macro crate and consumer |
| `feature_cfg` | Feature and target-cfg dependency edges |
| `include_edges` | `include_str!` and `include_bytes!` asset edges |
| `macro_rules` | Declarative macro definition and invocation |
| `native_link` | Native-link metadata emitted by a build script |
| `non_rust_assets` | JSON and KDL assets shipped with a crate |
| `secret_like` | Inert secret-shaped test values |
| `clean_repo` / `dirty_repo` | Repository-state fixture descriptions |
| `nushell_syntax` | Nushell source discovery |
| `symlink` | Portable symlink fixture specification |

`fixture_matrix.csv` is the machine-readable inventory. Fixtures use no
registry dependencies and can be checked offline. The `native_link` fixture is
intended for metadata/check analysis, not final linking, because its named
library is deliberately absent.

The `symlink` directory stores a manifest rather than a committed link so the
fixture remains portable on filesystems that cannot create symlinks. Consumers
should materialize the declared link in a temporary copy when testing.
