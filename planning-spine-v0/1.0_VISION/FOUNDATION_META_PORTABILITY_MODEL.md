# FOUNDATION — meta's Portability & Bootstrap Model (the escape from the cycle trap)

> **Why this document exists.** This is the *foundation the whole LifeOS vision sits on.* TEAS
> (the task engine), the cockpit, the app — all of it — are **tenants** of this model. Until this
> foundation is understood and completed, agentic systems die at the dev-startup phase. This captures,
> granularly and with code evidence, how **`meta`** solves it: peer repos that are **independent AND
> connected at the same time**, via the **all-cargo model** + a **version-free capability DAG** +
> a **portable prefix** that **envctl** eventually root-manages off system/user depth.
>
> App = **lifeos**. Org = **FlexNetOS** (the pre-existing org from the ElementArk conglomerate design).
> Surfaced 2026-07-08 by deep read of `src/meta` + `src/envctl`; every claim carries `file:line`.
>
> Navigation: [Vision index](./README.md) ·
> [Blueprint compatibility](./ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) ·
> [[planning-spine-v0/1.0_VISION/README]] ·
> [[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]

---

## 0. The problem this solves (owner's framing, verbatim intent)

- **GitHub layout ≠ OS layout.** A repo tree that is fine on GitHub is *not* a valid filesystem /
  operational layout for real OS work. For actual build/run/env operations, **file/folder structure is
  load-bearing, not cosmetic.**
- **The chicken-and-egg / cycle trap.** You cannot stand up the environment you *want* until you have
  built it — but building it needs an environment. So you are forced through an environment you *need*
  first. *"We can't set the env we want before we set the env we need to build the env we want."* **This
  bootstrap cycle is exactly where agentic systems stall at dev-startup.**
- **The trap's tempting-but-wrong escape:** fuse the repos into one monorepo workspace so everything
  "just builds together." That trades away portability and independence — the very properties the system
  needs. (This is what the stray `src/Cargo.toml [workspace]` attempted; see §5. The owner stopped it.)
- **The real escape:** keep every repo an independent, portable cargo crate; coordinate them with a
  *separate, version-free* capability graph; bootstrap on the host/nix rung you can't yet skip; then
  climb to a **self-owned portable prefix** that **envctl** manages off system/user depth. That is this
  document.

---

## 1. The model in one sentence

**Two orthogonal layers that never touch:**

| Layer | Owns | Mechanism | Property it buys |
|---|---|---|---|
| **Isolation** | *how* each unit builds | one cargo crate per repo, each with its **own** `rust-toolchain.toml` + own `Cargo.lock` | **independence** (build/version/clone/release standalone; zero conflict surface) |
| **Coordination** | *who provides/consumes what, in what order* | `.meta.yaml` capability DAG (`provides`/`depends_on`) + provenance ledger | **connection** (build order, impact analysis, release) — **with no version constraints** |

Because **everything is a uniform cargo crate**, the same portability primitive (toolchain pin +
lockfile + provenance) fully describes any unit's reproducible, offline, standalone build — so meta only
has to own **the graph and the ledger**, never a bespoke per-repo recipe. `provides`/`depends_on` is the
**coordination seam**; each `Cargo.toml` is the **isolation boundary**.

---

## 2. Isolation layer — cargo, per repo (independence)

**Every peer pins its OWN toolchain.** They are deliberately *not* identical — that is the whole point:

- `src/meta/rust-toolchain.toml:1-2` → `channel = "stable"`
- `src/meta/agent/rust-toolchain.toml:1-2` → `channel = "stable"`
- `src/flexnetos_runner/rust-toolchain.toml` → `channel = "stable"`, `components = ["rustfmt","clippy"]`
- `src/envctl/rust-toolchain.toml` → `channel = "nightly"`, `components = ["rustfmt","clippy"]`
- `src/prompt_hub/rust-toolchain.toml` → `channel = "1.96.0"`, `components = ["rustfmt","clippy","rust-src"]`

envctl deliberately pins **nightly** while the rest pin stable; its `rust-toolchain.toml` comment states
the policy: *"Meta workstation policy tracks the latest Rust nightly as the default dev toolchain (the
rustup component installs/updates `nightly` into `$META_ROOT/.toolchains/rustup` and makes it default)…
MSRV stays 1.88 (`Cargo.toml` rust-version); this is the developer toolchain, not the support floor."*
→ **a peer's `rust-toolchain.toml` is the rustup-honored standalone build pin; MSRV is a separate floor
in `Cargo.toml`.**

**The zero-conflict consequence (load-bearing).** meta never merges the crates into one resolver scope.
There is **no shared `Cargo.lock`**, therefore **no cross-crate version-unification event** — the single
place where cargo would force conflict resolution *never happens*. Two peers can pin different versions
of the same third-party crate and neither meta nor cargo cares, because **they are separate resolution
roots**. `cargo build` in any single repo works with **no meta present**.

---

## 3. Coordination layer — the version-free capability DAG (connection)

### 3.1 The graph source: `.meta.yaml` (semantic capability tokens, NOT cargo deps)
`src/meta/.meta.yaml` declares each project's **capabilities**, not cargo path/version deps:

```yaml
loop_lib:             provides: [loop-lib]                                   # :6-8
meta_plugin_protocol: provides: [plugin-protocol]                          # :10-12
meta_core:            provides: [meta-core]                                 # :14-16
meta_cli:
  provides: [meta-cli]
  depends_on: [meta-core, plugin-protocol, loop-lib]                       # :27-30
meta_git_cli:
  depends_on: [plugin-protocol, meta-git-lib, meta-cli, loop-lib]         # :33-35
envctl:
  path: ../envctl
  depends_on: [loop-lib, plugin-protocol]
```

**Key indirection:** `depends_on` names are *capability tokens*, and the project that emits a token is
whoever `provides` it. The **dependency-edge name is decoupled from the repo name** — this is what lets
repos move/rename without breaking the graph.

### 3.2 The parse: `meta_core/src/config.rs`
- `ProjectEntry::Extended` captures the fields verbatim: `provides: Vec<String>` (`config.rs:28-29`),
  `depends_on: Vec<String>` (`config.rs:30-31`).
- Normalized into `ProjectInfo` (`config.rs:39-55`, fields at `:47-51`) by `parse_meta_config`
  (`config.rs:194-217`), which **sorts projects alphabetically** for deterministic order (`config.rs:220`).
  *(Note: this alphabetical order is what `meta exec` consumes today — see the gap in §4.2.)*
- `defaults.parallel` default enforced at `config.rs:68-74`; nesting/orphan walk at `config.rs:382-417`
  (`walk_meta_tree`) treats each entry as a first-class standalone repo.

### 3.3 The graph build: `meta_cli/src/dependency_graph.rs`
`DependencyGraph::build` (`:65-132`) is a two-pass resolver:
- **Pass 1** registers every project and inverts `provides` into `providers: HashMap<capability → project>`
  (`:78-90`), warning on duplicate providers (`:79-86`).
- **Pass 2** resolves each `depends_on` token against **two namespaces** (`:100-114`):
  ```rust
  let resolved = if graph.projects.contains_key(dep) { dep.clone() }        // direct project name (:101-103)
      else if let Some(provider) = graph.providers.get(dep) { provider.clone() } // capability → provider (:104-106)
      else { log::warn!("Unresolved dependency ..."); continue; };          // (:107-114)
  ```
  Edges land in a forward adjacency list `dependencies` and a reverse `dependents` (`:117-127`) — the
  reverse list makes impact analysis O(1) to seed.
- `ProjectDependencies` has **no version field at all** (`:22-35`) — the graph carries **zero version
  constraints**. This is why it can coordinate without ever creating a conflict.

### 3.4 Topological order + cycle rejection (Kahn's algorithm)
`execution_order()` (`dependency_graph.rs:227-277`):
- in-degree = number of dependencies (`:239-242`); seed queue with zero-dep roots (`:245-249`) — here
  `loop_lib`, `meta_core`, `meta_plugin_protocol`, `meta_git_lib`, + standalone tools;
- pop a node, decrement each *dependent*'s in-degree, enqueue at 0 (`:252-265`) → "dependencies first."
- **Cycle detection is structural** (`:268-274`): `if result.len() != projects.len() { bail!("Dependency
  cycle detected! Processed {} of {}") }`. A second independent DFS finder `detect_cycles()` (`:308-350`,
  `rec_stack`) reports the actual cycle path (`:339-343`) and feeds `summary().has_cycles` (`:420`).
- `execution_order_filtered()` (`:280-295`) sorts first, then filters by tag, preserving topo order.
- Impact analysis: `analyze_impact` (`:183-223`), `get_all_dependencies` (`:151-179`).
- **Tests pin the guarantees:** `test_execution_order` asserts `shared-utils < auth-service <
  api-service < web-app` (`:519-537`); `test_provided_item_resolution` confirms a `depends_on` on a
  provided capability resolves to its provider (`:539-547`).

---

## 4. `meta exec` — how commands run across repos (+ the concrete gap)

### 4.1 The executor path
`meta_cli/src/main.rs` `Commands::Exec` (`:580-601`) → `handle_command_dispatch` (`:662-1013`) →
`loop_lib::run`. It parses `.meta` (`main.rs:915`), optionally tag-filters (`:918-931`), builds
`project_paths` = meta root + each project path (`main.rs:933-939`), and fans the command out.
- **Parallel vs sequential** decided at `main.rs:686-703`: `--parallel` wins, else `--sequential`, else
  `.meta defaults.parallel` (`true` here) → `LoopConfig.parallel` (`main.rs:968`).
- **The fan-out** (`loop_lib/src/lib.rs`): `execute_commands_internal` (`:627`) branches on
  `config.parallel`: parallel = `commands.par_iter()` over a rayon pool (`:683-745`, `max_parallel`
  cap `:736-742`, `spawn_stagger_ms` `:690-694`); per-dir run `execute_command_in_directory_capturing`
  (`:712-718`). Results re-sorted only for display determinism (`:749-752`), not execution order.

### 4.2 ⚠️ THE GAP (a ready-but-unwired rung, not a misunderstanding)
**`execution_order()` is fully implemented and cycle-safe, but it is NOT wired into `meta exec`.** Today
exec fans out in **alphabetical declaration order** (the `config.rs:220` sort), *not* DAG order. The graph
currently feeds only **impact analysis** and the **`meta context` dependency display** — the sole non-test
consumer of `DependencyGraph` is `context.rs::build_dependency_map` (`context.rs:293-318`), which calls
`get_dependencies` for *display*, never `execution_order`.
→ **Next rung (highest-leverage, cleanest):** wire graph → `LoopConfig.directories` so exec runs
**parallel within a DAG level, sequential across levels**. The primitive exists; only the wiring is
missing. This is the missing half of "connected."

---

## 5. Why NOT a monorepo `[workspace]` — the rejected near-miss

A top-level `[workspace]` (the stray `/home/flexnetos/lifeos/src/Cargo.toml`, v0.2.25, members
`loop_lib`+`meta_plugin_protocol`) fuses all members into **one dependency-resolution graph with one
shared `Cargo.lock`**, forcing:
- a **single unified version** for every shared transitive dependency (cargo feature-unification + one
  lockfile) → a bump in one crate can silently change/break another (coupled resolution, coupled CI);
- crates that **cannot be independently versioned, cloned, or released** — the workspace root is required
  to build any member;
- **"works-in-workspace / breaks-standalone" drift** from unified feature flags.

It also violated the workspace's own charter — `src/OWNERSHIP.md:19`: *"Hollow workspace — it **must not
become a monorepo or source blob.**"* The capability-graph model gives the **opposite** properties, each
backed by code: independence (§2), connection-without-fusion (§3), and **no conflict** because resolution
stays per-crate (there is no shared lock to conflict over — the monorepo's core failure mode is
*structurally absent*). **The `[workspace]` bought build-visibility by paying portability; the design
refuses that trade.** (The correct per-repo application of the same principle: `agent`'s own `[workspace]`
table — FlexNetOS/agent PR #10 — makes it self-contained, immune to any stray parent manifest.)

---

## 6. Toolchain ownership — policy + ledger, NOT a single `.tool-chain` file

**Correction to an earlier guess:** there is **no single meta-owned `.tool-chain` JSON manifest.**
Ownership is split across three concrete mechanisms:
1. **Per-repo pin** — each peer's `rust-toolchain.toml` (§2): the standalone, rustup-honored build pin.
2. **`.tool-versions`** — `src/meta/.tool-versions` is exactly 12 bytes: `rust stable` (asdf/mise read
   it). Only `meta` ships one; a meta-root convenience pin, redundant with meta's own `rust-toolchain.toml`.
   **Not** a cross-repo manifest.
3. **The real "manifest" = the release/provenance ledger.** What meta *owns* is the **recording**, not a
   checked-in toolchain descriptor. Per `docs/lifeos-toolchain-and-dependency-bundle.md:42-43`: *"The
   runner records rustc/cargo versions, target triple, lockfile hash, and binary checksums."* Authoritative
   artifacts: `manifests/sbom.json`, `manifests/license-map.json`, `manifests/checksums.sha256`,
   `manifests/provenance.json` (`lifeos-toolchain-and-dependency-bundle.md:87-94`) + the prefix top-level
   `manifest.json` (`lifeos-release-filesystem-layout.md:12`).

**So: meta owns the *policy and the ledger*; each peer owns its *pin*.** The "`.tool-chain`" concept is
`docs/lifeos-toolchain-and-dependency-bundle.md` **materialized** as the portable prefix's `toolchains/`
subtree + `manifests/provenance.json`.

---

## 7. The portable prefix (the release artifact — a prefix, not a host root)

Thesis (`lifeos-toolchain-and-dependency-bundle.md:4-8`): *"The portable release should be built from
pinned source and lockfiles, with runtime dependencies copied into the LifeOS prefix only after proof.
Ambient host tools are allowed for building only when their versions and provenance are recorded."* And
`lifeos-portable-release-roadmap.md:108`: *"The release artifact is a **portable prefix, not a host root**."*

The bundle is a **layered prefix**, not a git-vendored cargo dir:
- **Toolchain payloads** under `toolchains/rust/`, `toolchains/bun/`, `toolchains/node/`, `toolchains/nix/`,
  `toolchains/cuda-probes/` (`lifeos-release-filesystem-layout.md:91-96`, "Build/adopt only" mutable `:123`).
- **Pinned source snapshots** under `repos/` and `sources/{crates,npm,git}/`, kept separate from runtime
  binaries (`lifeos-portable-release-roadmap.md:210-212`; layout `:82-90`).
- **Rust binaries built from pinned repos**, listed explicitly (`lifeos-toolchain-and-dependency-bundle.md:29-40`:
  meta, meta-mcp, loop, plugins, LifeOS Tauri shell, lifeos-core, lifeos-daemon, lifeos-supervisor,
  lifeos-update-manager, lifeos-adopt-tool).
- **Bun/Node** pinned offline via `bun install --frozen-lockfile`, recording `bun.lock` hash, copying only
  runtime-needed payloads (`:47-54`).
- **Build-before-adopt gate** (`:76-83`): capture provenance → build under `sources/`+`var/tmp` → run
  proof gates → record checksums/license → promote into `opt/adopted` only after policy approval.
  *"Missing license or provenance data blocks release publication"* (`:94`).
- **Relocatability**: the prefix must be relocatable unless a `file-map.json` entry marks a path
  non-relocatable with reason/owner/mitigation (`lifeos-release-filesystem-layout.md:128-136`).

**OPEN QUESTION (undecided):** whether the **Rust toolchain** is bundled as a closure under
`toolchains/rust/` or merely recorded as **build-only provenance** (`lifeos-toolchain-and-dependency-bundle.md:19`).

---

## 8. The bootstrap resolution: nix/system-depth NOW → envctl-root-managed prefix LATER

### 8.1 NOW — host/nix-store depth is an *explicitly accepted temporary downgrade*
- `lifeos-toolchain-and-dependency-bundle.md:57-67`: *"Yazelix is the runtime-bedrock candidate, but
  relocation is not proven… test one of: extracting a closure into the LifeOS prefix; static or patchelf
  relocation; appimage-like wrapper; **host-managed Nix prerequisite as a temporary downgrade.** Until
  that proof exists, Yazelix is a **BLOCKER** for claiming a self-contained release."*
- Roadmap **Q2** (`lifeos-portable-release-roadmap.md:528`): *"Can Yazelix/Nix runtime closure be
  relocated without host /nix/store reliance? — **BLOCKER until proven**,"* and `:351-353`: *"avoid relying
  on host /nix/store symlinks unless explicitly documented as a temporary blocker."*

### 8.2 LATER — envctl root management (already partly built in code)
envctl lands built artifacts into a **self-owned root** and treats the legacy toolchain path as a bridge
to be retired:
- `src/envctl/crates/engine/src/install.rs:1-9`: *"Phase 4 INSTALL + WIRE-IN. Lands built artifacts into
  `$META_ROOT/usr/bin` under… frontdoor wrappers… whose CANONICAL target is inside
  `$META_ROOT/var/lib/envctl/repos/<slug>/`."*
- `src/envctl/crates/engine/src/layout.rs:4-9`: everything must *"resolve through a single registry/layout
  surface and land under `$META_ROOT`."* Crucially `.local/bin` and `.toolchains/` are labeled **"legacy
  bridge / compatibility-only"** (`layout.rs:333-335` `legacy_toolchains()` = `$META_ROOT/.toolchains`;
  `:924` *"compatibility .toolchains must not be materialized as canonical layout"*).

### 8.3 The escape, stated plainly
Bootstrap builds today on ambient host + a host-managed Nix prerequisite (accepted downgrade). envctl
**progressively relocates** the toolchain out of the legacy `$META_ROOT/.toolchains` bridge (where rustup
nightly installs today) into the **canonical envctl-root-managed prefix** (`$META_ROOT/usr/bin`,
`$META_ROOT/var/lib/envctl/repos/…`), whose release-layout target is the portable prefix's own
`toolchains/` + `manifests/provenance.json`. **At that point the host-Nix prerequisite can be dropped and
the "self-contained release" claim (currently a BLOCKER) becomes provable.** *That is the climb out of the
chicken-and-egg cycle: bootstrap on the host rung, ascend to a self-owned prefix, never fuse the repos.*

---

## 9. The gaps / next rungs (actionable, prioritized)

| # | Rung | State | Evidence |
|---|---|---|---|
| **G1** | **Wire `execution_order()` into `meta exec`** (build in DAG order: parallel-within-level, sequential-across-level) | primitive **built + cycle-safe**, **not wired** (exec fans out alphabetically) | `dependency_graph.rs:227-277` vs `main.rs:933-939`, `context.rs:293-318` |
| **G2** | **Decide Rust-toolchain bundling** (closure under `toolchains/rust/` vs build-only provenance) | **OPEN QUESTION** | `lifeos-toolchain-and-dependency-bundle.md:19` |
| **G3** | **Prove Yazelix/Nix relocation** (closure-extract / patchelf / appimage / documented host-nix downgrade) | **BLOCKER** for a self-contained release | roadmap `:528`, bundle `:57-67` |
| **G4** | **Complete envctl root relocation** — retire the `.toolchains` legacy bridge, make `$META_ROOT` canonical | partly built (install.rs/layout.rs); legacy bridge still live | `envctl/crates/engine/{install.rs,layout.rs:924}` |

---

## 10. How TEAS (and the whole app) sit on this foundation

TEAS (the task engine built in `meta-ruvector/crates/rvAgent/rvagent-engine`, PR #102) and the LifeOS app
are **tenants** of this foundation, not peers of it. Until the portable prefix + envctl-root exist, they
run on the **bootstrap rung** (host/nix depth). Once the foundation ships a runner-proven prefix, TEAS and
the app run **off the prefix, off system/user depth**. **The foundation is the gate, not the app** — which
is precisely why agentic systems that skip it die at dev-startup.

---

## 11. Evidence index (canonical file:line references)

- Per-repo toolchain pins: `src/{meta,meta/agent,flexnetos_runner,envctl,prompt_hub}/rust-toolchain.toml`
- `.tool-versions`: `src/meta/.tool-versions` (`rust stable`)
- Capability graph source: `src/meta/.meta.yaml:6-56`
- Parse (`provides`/`depends_on`): `src/meta/meta_core/src/config.rs:28-31, 47-51, 194-220, 68-74, 382-417`
- DAG build + capability resolution: `src/meta/meta_cli/src/dependency_graph.rs:65-132` (resolve `:100-114`)
- Toposort (Kahn) + cycle bail: `dependency_graph.rs:227-277`; DFS cycle finder `:308-350`; impact `:183-223`
- `meta exec` dispatch + repo-list build (alphabetical, no toposort): `meta_cli/src/main.rs:580-601, 915-939, 686-703, 960-975`
- Fan-out executor (rayon/sequential): `meta/loop_lib/src/lib.rs:627, 683-745`; per-dir run `:712-718`
- Only non-test graph consumer (display): `meta_cli/src/context.rs:293-318`
- Toolchain/dependency bundle design: `src/meta/docs/lifeos-toolchain-and-dependency-bundle.md` (esp. `:4-8,19,29-40,42-43,47-54,57-67,76-94`)
- Portable prefix roadmap: `src/meta/docs/lifeos-portable-release-roadmap.md` (`:16-27, 108, 210-212, 228-251, 288-304, 351-353, 528`)
- Release FS layout: `src/meta/docs/lifeos-release-filesystem-layout.md` (`:12, 82-96, 123, 128-136`)
- envctl root machinery: `src/envctl/crates/engine/src/{install.rs:1-9, layout.rs:4-9,333-335,924}`
- Workspace ownership charter: `src/OWNERSHIP.md:19` (hollow workspace, not a monorepo)
