# NotebookLM source extraction protocol

This protocol is a tracked evidence boundary for repository-owned verification.
It is not a task-board authority and it does not promote a generated answer to
truth without a local receipt.

## Temporary directories

Temporary directories are disposable test fixtures only. They must never be
treated as the installed runtime, a package owner, a durable source tree, or a
release receipt. `bun add --cwd` probes are explicitly negative probes: a
passing temporary install does not prove the root `package.json` or `bun.lock`
owns the dependency.

The maintained proof must resolve every package from the repository's real
`node_modules`, use the profile-owned Bun and Bunx frontdoors, and record the
exact package and native binary identity. A red test is evidence of a missing
contract, not permission to substitute an untracked dependency.

## Command and model boundaries

The profile contract is `npm = bun` and `npx = bunx`. Verification runs from
the LifeOS root and does not silently use a global or temporary package tree.
OpenRouter `tencent/hy3:free` is a referenced model only when a live authenticated generation is actually available. Without the required
`OPENROUTER_API_KEY`, its claim remains unverified and the receipt must say so.
Never silently substitute another model.

Native RuvLLM, RVF, SONA, graph, router, and GNN capability may be proven by
the repository-owned package and binary checks. That capability is not proof
of automatic governed-agent startup, live swarm projection, UI real time, or
forecasting. Each claim retains its bounded status in
`NBVERIFY-004.local-evidence.json`.
