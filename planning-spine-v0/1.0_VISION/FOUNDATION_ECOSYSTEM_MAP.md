---
id: lifeos.vision.foundation-ecosystem-map
title: LifeOS Foundation Ecosystem Map
description: Evidence-cited built-versus-planned ownership map for Meta coordination, consolidation, vault, and RuVector OS surfaces.
type: architecture-cross-reference
status: verified-with-gaps
lifecycle: maintained
created: 2026-07-08
updated: 2026-07-13
aliases:
  - Foundation ecosystem map
  - LifeOS ownership map
tags:
  - lifeos
  - foundation
  - ecosystem
  - ownership
related:
  - "[[planning-spine-v0/navigation/README]]"
  - "[[planning-spine-v0/1.0_VISION/README]]"
  - "[[planning-spine-v0/1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL]]"
  - "[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]"
---

# FOUNDATION — LifeOS Ecosystem Map (coordination fabric, consolidation engine, vault, ruvector OS)

> Companion to `FOUNDATION_META_PORTABILITY_MODEL.md`. Surfaced 2026-07-08 via a 5-agent read-only
> deep-dive of `meta`, `.kb`/`.context`, `nu_plugin`/`envctl`, `meta-ruvector` (ruvix/rvm), and the
> Cognitum/vault stack. Every claim carries `file:line` and is marked **BUILT** or **PLANNED**.
> App = **lifeos**. Org = **FlexNetOS**. The vault agent obeyed a strict no-secret-values rule.
>
> **Purpose:** answer the owner's pointed questions — *did the harness + the new TEAS engine reinvent or
> break what `meta` already provides?* — and map the four systems that the LifeOS endgame depends on:
> the coordination fabric, the single-binary consolidation engine, the secrets vault, and ruvector-as-OS.
>
> Navigation: [Vision index](./README.md) ·
> [Blueprint compatibility](./ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) ·
> [[planning-spine-v0/1.0_VISION/README]] ·
> [[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]

---

## 0. Executive answers to the pointed questions

1. **Why `meta git` and not `git`?** Because the atomic unit here is *the graph of repos*, not one repo.
   `meta git` = cross-repo orchestration: graph-aware clone (clones the whole `.meta` dependency graph),
   cross-repo `status`/`commit`, **workspace snapshots** (a multi-repo transactional checkpoint of every
   repo's SHA, with auto-stash restore), SSH ControlMaster pooling, and worktrees-across-the-graph. Plain
   git has no equivalent for any of these. `meta_git_cli/src/lib.rs:72-88`; `meta_git_lib/src/snapshot.rs:33`.
2. **Why a hook wrapper when meta already has hooks?** They're **two different lifecycle layers, not a
   duplicate** — with one small overlap. meta's `.githooks` fire on **git ops** (pre-commit fmt, pre-push
   full CI, commit-msg conventional). The harness `~/.claude/hooks/` fire on **Claude-Code tool calls**
   (guard-bash, guard-write-paths, guard-agent-spawn, block-cherry-pick, budget/telemetry). Different
   triggers; neither can substitute for the other. **Overlap:** destructive-Bash gating — the harness
   `guard-bash.sh`/`block-cherry-pick.sh` overlap meta's **own** `agent guard` (`.claude/agent-guard.toml`);
   both fail-closed, no conflict, harness is stricter + machine-global.
3. **Are we not using the meta system?** You **are** — but the "meta system" that matters for tasks is
   **gitkb + handoff**, *not* `meta_project_cli`. `meta_project_cli`/`.meta.yaml` is a *build/repo*
   dependency graph (no WorkOrder/claim/proof concept). TEAS correctly consumes gitkb `ready` (selection)
   and handoff `hf claim` (lease/proof), and implements the *existing* `rvagent-a2a::TaskRunner`.
4. **Does the current task system break what was there?** **No — complementary, not conflicting** (§2.3).
   The only duplication (TEAS's own `WorkOrder`/`ProofLedger` types) is a *deliberate anti-corruption
   mirror* forced by a real repo cycle, guarded by an adapter + schema drift gate. **The real gap is a
   missing write-back:** TEAS reads gitkb for selection but its execution status + proofs live only in its
   SQLite — a `git-kb board`/`graph` observer never sees TEAS reality (§2.4).

---

## 1. meta as the coordination control plane

### 1.1 `meta git` — cross-repo orchestration (BUILT)
`meta_git_cli` (dispatch `lib.rs:72-88`) does what plain git cannot:
- **Graph-aware clone/update** — reads `.meta`, clones the *entire dependency graph*; clone queue with SSH
  rate-limit handling (`clone_queue.rs`, `is_ssh_rate_limit_error`).
- **Cross-repo `status`/`commit`** across every peer in one call (`status.rs`, `commit.rs`).
- **Workspace snapshots** — first-class multi-repo transactional checkpoint: `git snapshot
  create/list/show/restore/delete` captures every repo's SHA (`snapshot.rs:33` `Snapshot`/`RepoState`),
  `restore` re-pins all repos with auto-stash (`SNAPSHOTS_DIR=".meta-snapshots"`). *Plain git has no
  equivalent — this is the safe rollback surface meta steers agents toward.*
- **SSH ControlMaster pooling** (`ssh_setup.rs::establish_ssh_masters`) — shared multiplexed connections
  across the workspace to dodge per-repo handshakes/rate-limits.
- **Worktrees across the graph** with filesystem worktree-context detection so `meta exec` auto-scopes.

### 1.2 Hooks — two layers (BUILT)
- **meta git-lifecycle** (`.githooks/`, `core.hooksPath`; `.git/hooks/*` are inert `.sample`): `pre-commit`
  = `cargo fmt --check` on staged Rust (`pre-commit:36-49`); `pre-push` = full CI mirror `fmt + clippy -D
  + test --workspace` (`pre-push:40-61`); `commit-msg` = Conventional Commits (`commit-msg:16-27`).
- **harness Claude-Code hooks** (`~/.claude/hooks/`, `~/.claude/settings.json`, events SessionStart /
  PreToolUse / PostToolUse / UserPromptSubmit / SubagentStop / Stop): `guard-bash.sh` (anti-recursion +
  anti-destruction), `guard-write-paths.sh`, `guard-agent-spawn.sh` (depth-1 + fan-out + budget),
  `block-cherry-pick.sh`, plus session/telemetry hooks.
- **Overlap only at the destructive-Bash seam;** meta's `agent guard` (`.claude/agent-guard.toml`, patterns
  `meta.git.force_push/reset_hard/clean_force`) and the harness guard both fire in-repo, both deny,
  no conflict, harness adds cherry-pick/recursion/fan-out meta's guard lacks.

### 1.3 `meta/.claude` — meta ships its OWN Claude-Code integration (BUILT)
Not a passive target. `meta/.claude/`: its own `settings.json` (`PreToolUse(Bash)` → native Rust `agent
guard`; `SessionStart` → `meta context` + `git kb service start`; `PreCompact` → `meta context`);
config-driven `agent-guard.toml`; rules (`meta-destructive-commands`, `meta-workspace-discipline`,
`refactoring-safety`, `code-intelligence`, `knowledge-management`); skills (`meta-git`, `meta-exec`,
`meta-worktree`, `meta-workspace`, `meta-safety`, `gitkb`, …); slash commands (`kb-tasks`, `kb-board`,
`kb-status`, `kb-context`, `kb-commit`); a `meta-worker` agent. The harness re-implements **only** the
Bash-guard seam (as always-on/machine-global vs meta's project-scoped); everything else is meta-unique.

### 1.4 The REAL task system = gitkb + handoff (NOT `meta_project_cli`)
- `meta_project_cli` + `.meta.yaml` `provides`/`depends_on` + `meta exec` = **build/repo orchestration**
  (dependency-ordered fan-out); **no** WorkOrder/claim/proof concept.
- **gitkb** = the task backlog/board: tasks are gitkb docs of `type: task` (`.claude/commands/kb-tasks.md`),
  `git-kb ready` = deterministic ranked selection, `board`/`graph` = views.
- **handoff** (`hf`) = the claim/lease/proof authority (`handoff-lease` + witnessed ledger).

---

## 2. The knowledge/memory substrate: `.kb` + `.context`, and how TEAS integrates

### 2.1 `.kb` (GitKB) — database-first coordination knowledge base (BUILT)
*"GitKB is a database-first knowledge base… the database is the source of truth"* (`meta/.kb/AGENTS.md:261-263`).
Topology: **1 root coordination KB (`meta/.kb`, 96 docs / 94 commits) + N peer-local KBs + a 2nd app-level
`lifeos/.kb`**. Typed docs (`task`/`incident`/`spec`/`context`/`architecture`/`view`) = Markdown + YAML
frontmatter, UUIDv7 ids, graph edges (`[[wikilinks]]`, `parent`/`resolves`, `[[code:path::symbol]]`), a
tree-sitter code index, and a lifecycle (`draft→backlog→active→blocked→completed`). Selection primitives:
`git-kb ready` (ranked ready backlog), `board`, `graph`, `context --task`. The 7 `context/*` docs
(immutable/extensible/overridable tiers) ARE the agent memory bank, reloaded per session
(`meta/.kb/store/documents/tasks/meta-peer-local-kb-bootstrap.md`, `…/meta-system-architecture-documentation.md`).
Store DB (`.cache/gitkb.db`) is **gitignored** → local-per-checkout, not committed.

### 2.2 `.context` — human-authored vision/onboarding surface (BUILT)
`meta/.context/` = flat files: `CONTEXT.md` (role+vision prompt seed), `VISION_PLAN.md`, and **CSV task
graphs** (`lifeos-release-task-graph.csv`, `…-file-map.csv`) — the *human precursor* to the three-surface
CSV TEAS now generates from `WorkOrder`. Read by `meta context`. Distinct from `.kb` (flat files vs DB;
onboarding seed vs live coordination). Also note the separate `.handoff/context/` per-repo surface tied to
the lease/claim mechanism.

### 2.3 TEAS integration — complementary, wired into the right layers (BUILT)
- **No parallel task type** — implements the existing `rvagent_a2a::TaskRunner`; *"no parallel task type
  (ADR-159)"* (`rvagent-engine/src/lib.rs:1-6`).
- **Canonical schema** — `WorkOrder` = the `handoff.task.v1` contract (`workorder.rs:1-9`); statuses match
  handoff's.
- **Consumes gitkb selection** — `git-kb ready --json --limit 1` (`selection.rs:1-8`).
- **Defers to handoff lease** — `hf claim <slug>` with `HF_LEASE_HOLDER`; refusal = first-class
  `ClaimConflict` (`selection.rs:16-23`).
- **Proof mandatory** — `Completed` only on a real exit-0 verification; ledger-append failure aborts the
  completion (`lib.rs:56-65,171-217`).
- **The one sanctioned duplication:** TEAS's own `WorkOrder` + SQLite `ProofLedger` are anti-corruption
  mirrors **forced by a repo cycle** (rvagent-engine cannot depend on handoff — handoff already depends on
  meta-ruvector's `ruvector-verified`/`rvf-*`/`cognitum`; `workorder.rs:2-9`, `ledger.rs:9-13`), guarded by
  the adapter (S3) + schemars drift gate (TEASTASK-003) + S5 ingestion.

### 2.4 ⚠️ THE OPEN SEAM — TEAS doesn't write back to gitkb
TEAS reads gitkb for *what to do next*, but its **canonical WorkOrder bodies, execution status, and proofs
live only in its own SQLite** — never written back as gitkb `task` doc status / `incidents`. So `git-kb
board`/`graph` do **not** reflect TEAS execution or proofs; the two are coupled only by a bare `slug`.
**Resolution options:** (a) round-trip WorkOrder status + proof back into gitkb `tasks/*` + `incidents/`
so board/graph reflect reality, or (b) make gitkb `task` docs the authoritative WorkOrder source (an
ingestion adapter). Today it is *"in addition to"* gitkb, not *"through"* it. **This is a real new gap.**

---

## 3. THE CONSOLIDATION ENGINE — how the "single lifeos app" gets built

The claim *"envctl DB + nu_plugin + nushell can import any repo/crate, transform, consolidate, merge,
rust-port, export a single binary"* is **architecturally coherent and its load-bearing pieces are BUILT
(one leg proven end-to-end); the final single-binary + full all-repos run are PLANNED.**

| Stage | Mechanism | Status |
|---|---|---|
| **Import** any repo/crate | codedb whole-repo importer (Tier0 blob → Tier5 build facts → redb snapshot; `nu_plugin/docs/polyglot-import/whole-repo-import-architecture.md:9-21`); envctl `add-repo` | Rust/Tier0 **BUILT**; polyglot Tiers1-5 **PLANNED** (V1.2 PRD) |
| **Transform / rust-port** | `envctl add-repo --strategy refactor --ai-goal port-to-rust` — a **confined** AI agent (0700 clone, `--permission-mode`, never `--yolo`, no auto-commit) whose prompt ports a repo to an idiomatic buildable Cargo project preserving the original CLI (`addrepo.rs:615-630`; `RefactorGoal::{PortToRust,CherryPickToCrate,RenameForSynergy,Custom}` `model.rs:802`); `detect_build.rs` re-detects a ported Go/C repo as cargo | **BUILT** |
| **Consolidate / merge repos** | `rust-port-merge` harness (12 skills + 10 agents: researcher/architect/porter/parity-verifier/**merge-integrator**/cross-repo-referencer). Merge-integrator folds a parity-verified Rust unit INTO a destination repo, mapping overlapping subsystems onto existing substrates, resolving symbol conflicts **without downgrade** | **BUILT — proven once:** kasetto v3.2.0 absorbed into `envctl/crates/agent-env`, **102/115 parity, 0 duplications**, additive-never-clobber (`envctl/HANDOFF.md:119-124,155-156`) |
| **Replayable operation graph** | envctl **migration DB (redb)** — *"the migration is not a script; it is a database-backed, replayable operation graph."* 15 DDL entities: targets/packages/recipes/runs/operations/**run_events (hash-chained ledger)**/evidence/artifacts/graph_edges/approvals/validations/checkpoints/rollbacks/sessions; api/replay/views (`engine/src/migration_db/{mod.rs:1-16,store.rs:11-27}`). **Generalized to ANY target** (lifeos is just the first; `prompts/ANY_TARGET_EXTENSION_SPEC.md`) | DB substrate **BUILT**; the FlexNetOS consolidation *recipe run* **PLANNED** |
| **Export single binary** | `codedb_single_binary_export/` crate that embeds a compressed CodeDB snapshot (`assets/codedb-pack.zst`) + verify/list/materialize/license-report (`single-binary-rust-crate-export.md:9-47`). Note: it packages a *snapshot*; source→Rust translation is the port/merge harness's job, not this crate's | **PLANNED** (CDB100 design done, CDB101 prototype pending; no `ExportCrate` code yet) |

**Bottom line:** the mechanism to collapse a peer repo into the Rust-native core is BUILT and **proven once**
(kasetto → pure-Rust `crates/agent-env`); the durable, replayable, approval-gated substrate is BUILT; the
portable prefix that ships it identically is BUILT (`release/*.tar.gz`, real 160 MB, 2026-07-02). What's
**PLANNED**: polyglot whole-repo import, the single-binary export crate generator, and an end-to-end run
that collapses *all* lifeos peer repos into one shipped Rust-native binary. **The "single lifeos app" is the
documented endgame with its engine substantially built — not yet a completed artifact.**

---

## 4. Portable nushell-native database (BUILT)

Nushell is a **structured-data shell** — every pipeline value is a table/record; first-class `into sqlite`
/ `query db` / `open *.db`. envctl's `.nu` scripts use it as the data layer (`group-by`/`transpose`, a
table-registry with source+durability roles — `scripts/env-table-persistence.nu:7-60`). Design language:
*"Nushell is the table cockpit"* (`nu_plugin/GOAL.md:7`). **Why portable matters:** the same Nu binary +
codedb/envctl tables travel *inside the release prefix*, so the structured-query + table layer behaves
identically on any host with **zero system SQLite/Postgres dependency** — storage is pure-Rust **redb**,
preserving a **no-C trust boundary** (`ci/gates/no-c.sh`; `migration_db/mod.rs:8-9`). This is the
dependency-light, host-identical data substrate the portable app needs.

---

## 5. ruvector as an Agentic OS, and the rvm/nix question (CORRECTION)

### 5.1 ruvector is architecturally a complete Agentic OS (research-stage)
Every OS layer has a purpose-built crate family (`crates/ruvix/README.md:96-130`): **kernel** = RuVix
Cognition Kernel (6 primitives, 12 syscalls, proof-gated; BUILT, v0.1); **hypervisor** = RVM (§5.2);
**package/boot** = RVF cognitive container (AppImage model; BUILT, ADR-030); **mesh** = QuDAG; **memory** =
AgentDB + kernel HNSW; **inference** = RuVLLM + rvm-gpu backends. The raw master
plan calls ruvix/rvm an *"optional L0 substrate"* (`…Consolidated v1.md:77`),
but the owner directive makes it mandatory planned capability. **Operationally
research-grade, AArch64-targeted — not a shipping x86_64 host OS.** The gap blocks
present adoption; it does not remove the capability from scope.

### 5.2 rvm = bare-metal AArch64 microhypervisor (pre-operational)
*"No KVM. No Linux. No VMs. Bare-metal Rust."* Partitions = "coherence domains" gated by per-partition
capability tables (`rvm-partition/src/cap_table.rs`, 256 caps); scheduler `rvm-sched`; WASM guest
support is mandatory, currently limited to a **7-call, no-POSIX/no-filesystem/no-exec** ABI
(`rvm-wasm/src/host_functions.rs:103-160`). Runtime activation may be configurable; support and
compatibility proof are not skippable.
Target `aarch64-unknown-none` (`Makefile:16`). **`HARDWARE_SWITCH_IMPLEMENTED = false`** (`rvm-sched/src/switch.rs:37`) —
it is verified `no_std` libraries + a QEMU bring-up, not a running hypervisor executing real guests.

### 5.3 Can rvm replace nix NOW? — **No** (correcting the working assumption)
The G3 runtime that must relocate is **x86_64 ELF binaries pinned in `/nix/store`** (`yzx`, `cargo`,
`rustc`, `claude`, `codex`…; `release-baseline.json`). rvm fails on four independent grounds: **wrong ISA**
(aarch64 vs x86_64), **wrong runtime contract** (7-call no-POSIX ABI can't run `cargo`/`rustc`/`yzx`), **not
executing guests** (`HARDWARE_SWITCH_IMPLEMENTED=false`), and **not in the plan** (the G3 candidates are
patchelf/closure-extract/appimage/host-nix-downgrade — rvm/ruvix appear *nowhere* in the release path).
**The genuinely nix-adjacent artifact is RVF** (`rvf-runtime`, AppImage-style *"drop a file, it runs"*, ADR-030) —
but scoped to *cognitive/compute containers*, not host toolchains, so it doesn't solve G3 either. nixpkgs
probe: *"0 of 10 ruvnet names exist in nixpkgs — every Rust component is a source build"* → ruvnet **rides**
nix, doesn't replace it. **Near-term G3 fix stays: conventional relocation + envctl-root (G4).**
**Caveat:** the owner referenced a *recently-created* ruvnet VM; nothing matching is in the local tree — if
it's a newly-published upstream crate/npm, it is **not vendored here** and warrants a separate upstream check
before this conclusion is treated as final. Long-term, a matured RuVix+RVM would replace the *Linux host
itself*, not merely nix — a multi-year bet, not a swap-in.

---

## 6. Cognitum + the envctl secrets vault (DESIGN-LEVEL; no secret values read)

### 6.1 env-ctl — the "virtual credit card" credential broker (BUILT)
The real long-life key **never leaves the daemon (the TCB)**; clients get **≤24h peer-bound relay bearers**
swapped for the real key only at egress (`envctl/docs/secrets/ARCHITECTURE.md §1`). Two planes: **control** =
gRPC over a 0600 UDS, `SO_PEERCRED uid==owner`, fail-closed; **data** = loopback HTTPS relay proxy. Crates:
`secrets-engine` (pure sync core: broker/ca/vault/keyslot/inject/event), `secrets-proto` (tonic contract),
`secretd` (async daemon), `secretctl` (thin client), `secrets-store-libsql` (durable backend). 3-tier key
hierarchy (USB keyfile/passphrase → KEK via HKDF/Argon2id → single DEK via XChaCha20-Poly1305 keyslots →
per-record envelope), `Zeroizing`/`ZeroizeOnDrop`, `mlockall`+`RLIMIT_CORE=0`+`MADV_DONTDUMP`. Swap modes:
`BaseUrlRepoint` / `ProxyMitm` (local-CA MITM for hardcoded-host clients) / `NativeSubToken`. Egress:
default-deny `decide()`, per-provider upstream host allowlist, frozen Mozilla root pinning, USB
possession-gating re-checked at swap. Auto-inject = fork/exec (`env-ctl run -- <cmd>`) so the real key never
enters child env/argv/history. **Breach traceability:** hash-chained `audit_log` written **synchronously
before any security-relevant RPC returns**; refusals are `Ok`+`GuardRefused` + a `Refused` audit row.
Merge path: fold into `envctl/crates/*`, verbs under `envctl secret|vault|relay|ca|run`, `secretd` as a
manifest `SystemdUnit`. Vault is **portable-prefix-rooted** under `$META_ROOT` (config/share/state/runtime).

### 6.2 Cognitum — the hardware root of trust
**Cognitum One** = the platform/SDK/cloud (`vendor/cognitum-one`, `api.cognitum.one`, signed OTA).
**Cognitum Seed** = a pocket **hardware root-of-trust** (Raspberry-Pi-Zero-2-W-class ARMv7; matches the
master-plan "Cognitum seed on a Pi Zero 2 W"): 105+ REST endpoints + MCP (114 tools), an RVF vector memory,
a SHA-256 **witness chain** (tamper-evident writes), and **Custody** (device-unique Ed25519 key that never
leaves; `custody/sign|verify|attestation`). It is slated to be env-ctl's **USB possession factor /
Device-CA anchor / auto-unlock** source (`vault_hub/COGNITUM-SEED.md`, manifests `cognitum-seed-{net,trust,autounlock}.toml`).
The `cognitum-gate-kernel` crate (`no_std` WASM Anytime-Valid Coherence Gate, TileZero arbiter, signed
witness receipts) is the *software* embodiment of the Seed's witness discipline.

### 6.3 The vault architecture (vault_hub north star)
*"Cognitum Seed is the vault. KeePassXC is the human-editable encrypted DB. env-ctl is the runtime
encrypted vault + broker."* `vault_hub` is the **portable, raw-secret-free** glue repo: only placeholder
KeePassXC templates (`<FILL_…>`) + an `envctl-broker.template.csv` mapping entries onto `secretctl` enroll
commands, with a `git grep '<FILL_'` design rule.

### 6.4 The COGNITUM device is a *window*, not the vault
`/run/media/flexnetos/COGNITUM` is a **read-only onboarding window** (README/STATUS, `guide.html`, launchers,
and a `trust/` dir with the **public** name-constrained Device-CA cert + installer). The canonical vault
(secrets/CA-signing/registry/vector-memory/custody keys) lives **inside the Seed behind its API**; the drive
exposes no `secrets/`/`wallet/`/`keys/` dir.

### 6.5 ⚠️ SECURITY HYGIENE FINDING (verified by tracking-status only, contents never read)
`vault_hub` is a git repo (`git@github.com:FlexNetOS/vault_hub.git`). **Good:** the real secret material
(`vault_keeper/`, `.ssh/`, `.env`) is **untracked and NOT pushed** — only a *placeholder* template `.kdbx`
is committed. **Risk:** `vault_keeper/` and `.ssh/` are untracked **but not in `.gitignore`** (`.gitignore`
covers `*Passwords.csv` + `vault/keepassxc/live/*.kdbx`, not these) → one `git add -A` from being committed,
violating the repo's own raw-secret-free charter. **Recommended fix (owner):** add `vault_keeper/`, `.ssh/`,
`.env` to `.gitignore` (or move real material out of the repo tree entirely). *No values were read.*

---

## 7. New gaps / seams surfaced this pass (adds to G1–G4 in the portability doc)

| # | Item | Kind |
|---|---|---|
| **S-1** | vault_hub: `vault_keeper/`+`.ssh/`+`.env` untracked but **not gitignored** — accidental-commit risk | Security hygiene — **do first** |
| **S-2** | TEAS ↔ gitkb **write-back**: proof/status not reflected in gitkb `board`/`graph` (§2.4) | Integration seam |
| **S-3** | Harness `guard-bash` vs meta `agent guard` **redundancy** (not conflict) — could consolidate to one source of truth | Hygiene |
| **S-4** | Consolidation **single-binary export** (codedb CDB100/101) + full all-repos consolidation *run* | Endgame build |
| **S-5** | Verify whether a **newer upstream ruvnet VM** exists (owner referenced one) that could bear on G3 — not in local tree | Research |

---

## 8. Evidence index (canonical file:line)
- meta git: `meta/meta_git_cli/src/lib.rs:72-88`; `meta/meta_git_lib/src/snapshot.rs:33`; `ssh_setup.rs`
- meta hooks: `meta/.githooks/{pre-commit:36-49,pre-push:40-61,commit-msg:16-27}`; harness `~/.claude/hooks/*` + `~/.claude/settings.json`
- meta/.claude: `meta/.claude/{settings.json,agent-guard.toml,rules/,skills/,commands/,agents/meta-worker.md}`
- gitkb substrate: `meta/.kb/{AGENTS.md:261-263,config.toml,store/manifest.json,store/documents/tasks/*}`; app KB `lifeos/.kb/config.toml`
- .context: `meta/.context/{CONTEXT.md,VISION_PLAN.md,tasks/*.csv}`
- TEAS integration: `worktrees/mrv--teas-engine/crates/rvAgent/rvagent-engine/src/{lib.rs,selection.rs,workorder.rs,adapter.rs,ledger.rs,store.rs}`
- consolidation engine: `envctl/crates/engine/src/{addrepo.rs:615-630,model.rs:802,detect_build.rs,migration_db/{mod.rs:1-16,store.rs:11-27}}`; `envctl/.codex/agents/rust-port-*.toml`; `envctl/HANDOFF.md:119-124,155-156`; `nu_plugin/{GOAL.md,crates/nu_plugin_codedb/src/main.rs,docs/polyglot-import/*}`
- nushell DB: `envctl/scripts/env-table-persistence.nu:7-60`; `nu_plugin/GOAL.md:7`; `ci/gates/no-c.sh`
- ruvector OS / rvm: `meta-ruvector/crates/{ruvix/README.md:96-130,rvm/README.md,rvm/crates/rvm-sched/src/switch.rs:37,rvm/crates/rvm-wasm/src/host_functions.rs:103-160,rvm/Makefile:16}`; `docs/adr/ADR-030-rvf-cognitive-container.md`
- vault: `envctl/docs/secrets/{ARCHITECTURE.md,CHARTER.md}`; `envctl/crates/{secrets-engine,secretd,secretctl,secrets-store-libsql/src/schema.rs}`; `vault_hub/{README.md,COGNITUM-SEED.md}`; `meta-ruvector/{crates/cognitum-gate-kernel,vendor/cognitum-one}`; device `/run/media/flexnetos/COGNITUM/{README.txt,trust/}`
