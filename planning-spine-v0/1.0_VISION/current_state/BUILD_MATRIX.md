# TEAS Build Matrix (generated, --build)

> Generated 2026-07-08T03:05:15Z via `cargo check`. Real execution; last line of output shown.
> Note: the batch-pipeline context (execution-framework) is Python and physically lives inside the
> envctl repo; the envctl row's cargo check proves envctl's Rust compiles, not the Python pipeline.

| Context | Repo | cargo check | Evidence |
|---|---|---|---|
| intent-frontdoor | prompt_hub | OK | rc=0;     Finished `dev` profile [unoptimized + debuginfo] target(s) in 7.16s |
| contract-governance | rusty-idd | OK | rc=0;     Finished `dev` profile [unoptimized + debuginfo] target(s) in 3.50s |
| execution-kernel | handoff | OK | rc=0;     Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.71s |
| dispatch-substrate | meta | OK | rc=0;     Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.08s |
| runtime-swarm | meta-ruvector | OK | rc=0; note: to see what the problems were, use the option `--future-incompat-report`, or run `cargo report future-incompatibilities --id 1` |
| batch-pipeline | envctl | OK | rc=0;     Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.08s |
| runtime-swarm-js | ruflo | n/a | no Cargo.toml (external/js) |
