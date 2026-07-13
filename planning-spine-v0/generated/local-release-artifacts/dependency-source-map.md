# FlexNetOS / CodeDB Stack — Source-of-Truth Dependency Map

Research date: 2026-07-12. Read-only research. No repo files modified.

Owner directive being mapped:
> "Follow the source code path that lands in the node registry online; MOST not ALL of
> the latest code (node.js registry online) is accessed through `bun run` or `bunx` for
> packages; crates.io is fallback only. Use the source code as mapped from the notebooklm
> source extraction task."
>
> Plus the meta-ruvector clarification: "`~/meta-ruvector` is napi-rs exhaust, not
> untrusted; means *do not use* — follow the source code path that lands in the node
> registry online instead." There is no untrusted-supply-chain concern.

## 0. Headline reconciliation (read this first)

There are **two conflicting source-path recommendations** in the material, and the owner
directive resolves them:

- **Old NotebookLM blueprint guidance** (`Architecture Blueprint - LifeOS Core Foundation.md`,
  sections "napi-rs exhaust" / "Source Code Location: Fall back on Crates.io", and
  `NBSOURCE-023` claim `RUVPG-036`): *"pull pure Rust `ruvector-core`, `ruvllm`,
  `ruvector-sona` straight from crates.io; avoid cloning the messy napi-rs GitHub repo."*
  → **crates.io-primary.**
- **Current owner directive (authoritative, supersedes the above):** *npm node registry is
  PRIMARY via `bun`/`bunx`; crates.io is FALLBACK only; do not use the local `meta-ruvector`
  napi-rs clone as a source.* → **npm-primary.**

The owner has **inverted** the blueprint's original recommendation. The lifeos repo has
**already implemented the owner's npm-primary rule** and verified it against a real Bun
N-API runtime (see §3). The empirical registry data (§4) also **does not support** the
blueprint's "crates.io always lags npm" premise — both registries are actively co-published
from the same `ruvnet/ruvector` CI (crates.io `ruvector-core` 2.3.0 was published
2026-07-12, i.e. today). So "crates.io = fallback" is a **sourcing-policy choice**, not a
"npm is always newer" fact.

## 1. The three pillars of code ingestion (from `NBSOURCE-030` + Blueprint)

Phase-1 pipeline that converts flat files into a database-hosted codebase:

| Pillar | Component | Role | Source path |
|---|---|---|---|
| **1. The Parser** | **Nushell** | Traverses workspace, parses raw files into ASTs (functions/structs/deps) | Nushell runtime (profile / Yazelix-Nix) |
| **2. The Buffer** | **`nu_plugin`** (FlexNetOS/nu_plugin, the CodeDB plugin) | Catches structured blocks, writes to local **redb** cache at microsecond latency via MessagePack | Rust crate; `redb` from **crates.io** (no npm source) |
| **3. The Bridge** | **`envctl`** | Pulls blocks from redb, generates vector embeddings (`all-MiniLM-L6-v2`), commits code+vectors to **PostgreSQL** | Rust; `postgres` from **crates.io** (no npm source) |

Materialization (Phase 4, `NBSOURCE-031`): `envctl` queries the production branch → maps
`module_path` metadata → concatenates `raw_code` blocks into `.rs`/`.toml` files → dumps into
a Nix/Yazelix build env for static musl compilation.

## 2. Core dependency relationships (redb / ruvector / AgentDB / nu_plugin / yazelix / nix)

- **redb** — 100% pure-Rust, memory-mapped, ACID+MVCC embedded KV store. Roles: local AI
  scratchpad, high-frequency write buffer, BLAKE3-keyed embedding-dedup cache, application-level
  WAL in front of Postgres. **Passive** memory (static math; only "learns" if the external
  embedding model is retrained). *No AI/vector/SQL logic of its own* (`NBSOURCE-023` RUVPG-008/011/015).
  Independent third-party crate (`cberner/redb`) — **not** a ruvnet package.
- **ruvector** — Rust vector + GNN engine that installs as a native PostgreSQL extension
  (`ruvector-postgres`), "No Sidecar" Trojan-horse strategy; 230+ SQL functions, hybrid BM25+vector
  search, MinCut immune system, hyperbolic embeddings, 2-4 bit KV-cache quant.
- **AgentDB (`.rvf`)** — serverless single-file "cognitive container": **active** self-learning
  memory (Thompson Sampling / Q-Learning / PPO), holds MicroLoRA adapters + SONA policy matrices +
  FastGRNN routing graph + SHAKE256 witness chains. Counterpart of redb's passive store.
- **ruvllm** — Rust/Candle edge inference runtime; one frozen foundation model in shared memory,
  hot-swaps rank-1/2 MicroLoRA adapters from `.rvf` files in <1 ms → 50+ agents on one model footprint.
- **SONA** — Self-Optimizing Neural Architecture: the active-learning loop inside `.rvf`/ruvllm.
- **tiny-dancer** — FastGRNN neural router (the "FastGRNN Routing" pre-filter of `.rvf`).
- **nu_plugin** — Rust-native Nushell plugin, MessagePack protocol, streams typed tables into
  redb/`.rvf` without JSON serialization. In this repo the concrete plugin is **CodeDB**
  (`crates/nu_plugin_codedb`), built on `redb` + `postgres`, **not** on ruvector crates.
- **yazelix / nix** — Yazelix (Zellij+Nushell) is the workspace/runtime engine; Nix does the
  deterministic static-musl (`x86_64-unknown-linux-musl`) build to escape the `/nix/store` trap.
  `gitkb/meta` isolates the napi-rs/wasm "exhaust" from the pure-Rust build.

## 3. What the repos already declare (concrete evidence)

### 3a. `src/lifeos/package.json` — ALREADY npm-primary (Bun manifest)

Direct devDependencies (all pinned to current npm `latest` dist-tags):

| Package | Pinned | npm `latest` (2026-07-12) | Status |
|---|---|---|---|
| `ruvector` | 0.2.34 | 0.2.34 | current |
| `agentdb` | 3.0.0-alpha.17 | 3.0.0-alpha.17 (`latest` tag) | current (alpha line) |
| `@ruvector/ruvllm` | 2.6.0 | 2.6.0 | current |
| `@ruvector/rvf` | 0.2.3 | 0.2.3 | current |
| `@ruvector/sona` | 0.1.7 | 0.1.7 | current |
| `@ruvector/tiny-dancer` | 0.1.22 | 0.1.22 | current |

`trustedDependencies: ["agentdb","protobufjs"]`. Package manager: `bun@1.3.14`.

### 3b. Verified authority path (NBVERIFY-001 / NBVERIFY-004)

`scripts/verify-node-authority.mjs` + `tests/node-authority-install.spec.ts` + proof
`NBVERIFY-001.node-authority-receipt.json` establish the canonical rule verbatim:

> **authority_path: "published Node package → napi-rs native binding → local Rust crate implementation"**

Real Bun N-API runtime resolved and exercised (executor Bun 1.3.14 / Node-compat v24.3.0 / napi 10):
`ruvector` native impl, `@ruvector/rvf` → NodeBackend, `@ruvector/rvf-node` 0.1.8,
`@ruvector/core` 0.1.31, SONA forced-learning completed, ruvllm 51 adapters, tiny-dancer model
1268 bytes. Native linux-x64 optional binaries required by the spec:
`@ruvector/{attention,gnn,graph-node,router,ruvllm,rvf-node,sona,tiny-dancer}-linux-x64-gnu`
and unscoped `ruvector-core-linux-x64-gnu` (these are the napi-rs "exhaust" binaries, pulled
automatically as npm `optionalDependencies`). NBVERIFY-004 rerun (real Bun, revision 2) closed all
14 NBSOURCE-004 claims. The protocol doc pins the access-path mechanism: **`npm = bun` and
`npx = bunx`**, resolved through the profile (Yazelix/Nix foundation); temp-dir `bun add --cwd`
probes fail-closed.

### 3c. `src/nu_plugin` (CodeDB) — crates.io, but correctly so

`crates/codedb_store_redb/Cargo.toml`: `redb = "4.1"` (Cargo.lock → 4.1.0, from crates.io).
`crates/codedb_store_pg/Cargo.toml`: `postgres = "0.19"`, `postgres_rustls`, `tokio-rustls`.
Workspace deps: `nu-plugin = 0.113.1`, `nu-protocol = 0.113.1`.
**Grep for `ruvector|agentdb|napi|ruvllm|.rvf` across every nu_plugin `Cargo.toml` → zero hits.**
CodeDB does **not** consume any ruvector/agentdb crate; it is a standalone redb+postgres codebase
store. Therefore there is **no crates.io-where-npm-exists misalignment** in nu_plugin.

## 4. FULL dependency → source-path table

Access path key: **npm** = `bun add` / `bunx` (profile-resolved, `npm=bun`/`npx=bunx`);
**crates.io** = `cargo`/`Cargo.toml` (fallback).

| Dependency | Primary source (npm node registry) | npm latest | crates.io fallback | crates.io ver | Repo URL | NBSOURCE mapping |
|---|---|---|---|---|---|---|
| **ruvector** (TS SDK, native/WASM fallback) | `ruvector` (npm) | **0.2.34** | `ruvector-core` / `ruvector-postgres` | core **2.3.0** (upd 2026-07-12) | github.com/ruvnet/ruvector | 021,022,023,024; RUVPG-002/004/036 |
| **@ruvector/core** (native HNSW core, napi-rs) | `@ruvector/core` | **0.1.31** | `ruvector-core` | **2.3.0** | github.com/ruvnet/ruvector (npm/packages/core) | 023 RUVPG-002/036/039 |
| **@ruvector/ruvllm** (edge inference, napi-rs) | `@ruvector/ruvllm` | **2.6.0** | `ruvllm` | **2.3.0** (upd 2026-06-19) | github.com/ruvnet/ruvector (npm/packages/ruvllm) | 023 RUVPG-024/025; 013 |
| **@ruvector/sona** (active learning, napi-rs) | `@ruvector/sona` | **0.1.7** | `ruvector-sona` | **0.2.1** | github.com/ruvnet/ruvector (npm/packages/sona) | 023 RUVPG-025; 013; 021 |
| **@ruvector/rvf** (RVF SDK) | `@ruvector/rvf` | **0.2.3** | `rvf` (crate present in monorepo) | (co-published) | github.com/ruvnet/ruvector (npm/packages/rvf) | 013; 023 RUVPG-023; 032 YNP-008 |
| **@ruvector/rvf-node** (RVF native N-API binding) | `@ruvector/rvf-node` | **0.2.0** (runtime resolved 0.1.8 via rvf ^0.1.7) | `rvf` (Rust) | (co-published) | github.com/ruvnet/ruvector | 013; 023 RUVPG-023 |
| **@ruvector/tiny-dancer** (FastGRNN router, napi-rs) | `@ruvector/tiny-dancer` | **0.1.22** | `ruvector-tiny-dancer-core` / `-node` | (co-published) | github.com/ruvnet/ruvector (npm/packages/tiny-dancer) | 013 (FastGRNN); 023 RUVPG-025 |
| **agentdb** (`.rvf` cognitive container) | `agentdb` (npm) | **3.0.0-alpha.17** (`latest`); stable line 1.3.6 | *(none — TS pkg; native via better-sqlite3 + @ruvector/rvf backend)* | n/a | github.com/ruvnet/**agentic-flow** (packages/agentdb) | 007; 013; 023 RUVPG-023/034 |
| **redb** (embedded KV buffer/scratchpad/WAL) | *(none — no npm node-registry source exists)* | — | `redb` | **4.1.0** (7.2M dl, `cberner/redb`) | github.com/cberner/redb | 001,002,007; 023 RUVPG-007/010/014 |
| **postgres** (envctl → PG bridge) | *(none — Rust-only)* | — | `postgres` | **0.19** | github.com/sfackler/rust-postgres | 003,018,020; 023 RUVPG-049 |
| **nu-plugin / nu-protocol** (CodeDB plugin host) | *(none — Rust-only)* | — | `nu-plugin` / `nu-protocol` | **0.113.1** | github.com/nushell/nushell | 030,032; 023 RUVPG-042/045 |

Notes:
- **napi-rs platform "exhaust" binaries** (`ruvector-core-linux-x64-gnu`,
  `@ruvector/*-{linux,darwin,win32}-*`) are pulled automatically as npm `optionalDependencies`
  of the packages above. They are the *correct* npm-primary native path — the same `.node`
  addons that the local `meta-ruvector` clone generates but should NOT be sourced from locally (§6).
- The npm and crates.io **version lines differ** (npm `@ruvector/core` 0.1.x vs crate
  `ruvector-core` 2.3.x); you cannot compare them numerically. Treat them as parallel
  publication channels of one monorepo, with **npm as the owner-designated primary**.

## 5. Alignment audit — who already follows npm-primary / crates.io-fallback

| Manifest | Declaration | Follows the rule? |
|---|---|---|
| `src/lifeos/package.json` | `ruvector`, `agentdb`, `@ruvector/{ruvllm,rvf,sona,tiny-dancer}` from npm, Bun-managed, all at current `latest` | **Yes — fully aligned.** This is the reference implementation of the rule. |
| `src/lifeos/scripts/verify-node-authority.mjs` + `tests/node-authority-install.spec.ts` | Enforces the six npm packages + native optional binaries, resolves them only from repo `node_modules` via real Bun | **Yes — the rule is codified as a test gate + proof.** |
| `src/nu_plugin/**/Cargo.toml` (CodeDB) | `redb 4.1`, `postgres 0.19`, `nu-plugin/nu-protocol 0.113.1` from crates.io; **no** ruvector/agentdb crates | **Correct/aligned by exception** — every crate it uses is Rust-only with **no npm node-registry source**, so crates.io is the *only* (not "fallback-where-npm-exists") path. No misalignment. |
| `src/lifeos/src-tauri/Cargo.toml` | `tauri`, `reqwest(rustls)`, `keyring`, `sysinfo`, `lifeos-core` from crates.io/path; no ruvector/agentdb | **Aligned by exception** — no ruvector Rust crate is consumed here; the ruvector runtime is reached via the JS/Bun layer, per the rule. |

**Bottom line:** there is currently **no place in `src/nu_plugin` or `src/lifeos` that pulls a
ruvector/agentdb crate from crates.io where an npm source exists.** The stack already splits
cleanly: ruvector-family → npm (lifeos JS layer); genuinely-Rust-only infra (redb/postgres/
nu-plugin/tauri) → crates.io. The owner's rule is satisfied today.

## 6. What "napi-rs exhaust" means for `meta-ruvector` (and why not to source from it locally)

`~/meta-ruvector` (local `src/meta-ruvector/`, npm name `ruvector` v0.1.2) is the **factory
floor**, not a source of truth:

- It is the full `ruvnet/ruvector` **monorepo**: ~150 Rust crates under `crates/` (e.g.
  `ruvector-core`, `ruvector-postgres`, `ruvllm`, `sona`, `rvf`, `ruvector-mincut`,
  `ruvector-gnn`, dozens of `*-wasm` and `*-node` crates) **plus** `npm/packages/` containing
  the scoped JS packages **and** their per-platform native `.node` binaries
  (`ruvllm-linux-x64-gnu`, `tiny-dancer-darwin-arm64`, `router-win32-x64-msvc`, …).
- **"napi-rs exhaust"** = the auto-generated C/C++ FFI boilerplate + committed cross-compiled
  `.node` native addons that napi-rs (and `wasm-pack` for WASM) emit when the Rust engine is
  cross-compiled into Node.js/WASM extensions (`NBSOURCE-023` RUVPG-037/038; `NBSOURCE-014`;
  `NBSOURCE-029`; Blueprint "napi-rs exhaust" section). This exhaust is generated build output,
  committed to establish public "prior art," which makes the repo *look* like a messy scratchpad.
- Owner's clarification: this exhaust is **trusted** (not a supply-chain risk) but **must not be
  used as a local build/source input**. The correct path is the **finished, published npm node
  package** (which bundles the *same* napi-rs binding, already cross-compiled and versioned) —
  reached via `bun`/`bunx` — with crates.io as fallback.

Why not source from the local clone:
1. **It is generated output, not the release artifact.** The published npm package = the clean,
   versioned, integrity-checked delivery of that binding; the local monorepo is the mid-build state.
2. **Version drift / non-determinism.** The clone's `package.json` is `ruvector@0.1.2` and its
   crates/`npm` trees mix WIP, excluded-from-workspace, and non-compiling crates (the workspace
   `exclude` list explicitly drops broken crates like `ruvector-attention-cli`). Pinned npm
   dist-tags (`ruvector@0.2.34`, `@ruvector/ruvllm@2.6.0`, …) are reproducible; the working tree is not.
3. **Blueprint's own directive** (`gitkb/meta` isolation, `NBSOURCE-014`): keep the napi-rs/WASM
   exhaust *out* of the pure build. Consuming the published package honors that boundary; pointing
   Cargo/Bun at the local monorepo re-imports the exhaust.
4. The lifeos node-authority test already **fails closed** if any package resolves outside the
   repo's own `node_modules` — i.e. it structurally forbids sourcing from `../meta-ruvector`.

## 7. Concrete recommended changes (additive / upgrade-only)

The stack is already aligned, so recommendations are **guardrails and small currency bumps**,
not migrations. Nothing here removes functionality.

1. **Keep the six npm packages pinned to `latest` dist-tags (already true today).** On the next
   ruvnet release, bump via `bun add <pkg>@latest`; re-run `bun run verify:node-authority` +
   `bun run test:node-authority` to refresh the N-API proof. No crates.io equivalents needed for
   the ruvector family in the JS layer.
2. **Leave `redb 4.1`, `postgres 0.19`, `nu-plugin/nu-protocol 0.113.1` on crates.io.** These have
   **no** npm node-registry source; crates.io is canonical, not a rule violation. (Blueprint's
   hypothetical vector-enabled `shodh-redb` fork is *not* in use and should not be adopted without
   an explicit owner decision — `NBSOURCE-023` leaves it a gap.)
3. **If/when a Rust crate in this workspace ever needs ruvector's engine** (e.g. a future
   `codedb_store_ruvector`), the owner rule says reach it through the **npm/napi-rs path from the
   JS side**, not by adding `ruvector-core`/`ruvllm` to a `Cargo.toml`. Only fall back to the
   crates.io crates (`ruvector-core 2.3.0`, `ruvllm 2.3.0`, `ruvector-sona 0.2.1`) if a pure-Rust,
   no-Node build target genuinely requires it (e.g. static-musl bare-metal binary with no Bun
   runtime) — and record that as a fallback decision.
4. **Add a lockfile/sourcing guard (additive):** a CI check that greps `src/**/Cargo.toml` for
   `ruvector|ruvllm|agentdb|@ruvector` and fails if any appears (mirrors the existing JS-side
   node-authority gate on the Rust side), plus a check that `meta-ruvector` never appears as a
   `path`/`git` dependency in any consumed manifest. This makes "do not source from the local
   napi-rs exhaust" mechanically enforced rather than convention.
5. **Optional currency note:** `@ruvector/rvf-node` now has npm `latest` 0.2.0 (the verified runtime
   resolved 0.1.8 transitively via `@ruvector/rvf@0.2.3`'s `^0.1.7` range). This is transitive and
   controlled by `@ruvector/rvf`; no direct action unless you bump `@ruvector/rvf`.

## 8. Source provenance / caveats

- Local extraction files read in full: `Downloads/Notebooklm/` (1 blueprint `.md` + 3 context
  CSVs) and the 32 `NBSOURCE-0xx` claim-map extracts under
  `planning-spine-v0/generated/notebooklm_source_extracts/`. The `NBSOURCE-*` files are
  **atomic-claim-map artifacts** (classification + task refs), not raw prose; the concrete
  package/crate names live in the Blueprint `.md` and the CSV context tables.
- npm/crates.io figures fetched live from `registry.npmjs.org/<pkg>` and
  `crates.io/api/v1/crates/<crate>` on 2026-07-12.
- Every NotebookLM claim is flagged in-source as "queued for primary evidence / owner decision";
  the empirical registry data in §4 is the primary evidence for the *sourcing* question and, where
  noted, **contradicts** the blueprint's "crates.io always lags" premise while **confirming** the
  owner's npm-primary policy is already realized in `src/lifeos`.
