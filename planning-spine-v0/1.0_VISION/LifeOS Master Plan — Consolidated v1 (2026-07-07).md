# LifeOS Master Plan — Consolidated v1 (2026-07-07)

SINGLE-FILE CONSOLIDATION of the LifeOS planning surfaces on Google Drive plus their governing tables. Append-only doctrine: no source file was modified; this document is a NEW file that consolidates. Sources and dispositions are enumerated in §9 (Provenance). Scope interpretation is stated in §9.1 — "16 planning files" reconciled against observed inventory; every candidate interpretation is covered by this consolidation.

Consolidation rules used: newest-verified-first on conflict; contradictions surfaced in §7, never silently resolved; GAP is recorded where a source could not be read.

---

## 1\. NORTH STAR & OPERATING DOCTRINE (from Executable Spec §1, §6; ROOT doc; RULES.md)

**North Star (verbatim):** "LifeOS is the living company, personal, development, and home operating environment. It is not the CEO. LifeOS is the environment, runtime spine, memory substrate, policy layer, and execution surface." NOA is the product/personality name of the CEO agent; CECCA is the internal CEO-agent role/class; NOA implements the CECCA role inside LifeOS. Primary objective: **convert human intent into a governed, simulated, executable, verified task graph.** Main rule: always anchor the north star, then think small, act small.

**Runtime rule:** no agent receives unlimited authority; every meaningful action passes through identity, policy, memory, simulation, execution, proof, and rollback.

**Core doctrine (6 laws):** Integrity — do not mutate reality invisibly. Reversibility — no irreversible action without explicit authority. Capability Gain — every completed or failed action must improve future execution. No paper execution — documents are not completion; proof is completion. No trust in docs over observed runtime. Preserve the gold world; learn from failed worlds; promote only proven worlds.

**Constitution (§6, verbatim):** No hidden mutation. No unauthorized spend. No legal bypass. No real-world execution without authority. No optimization against human welfare. No production mutation without snapshot. No completion without proof. Critical rule: the CEO agent may propose, prioritize, and delegate — it may not execute raw shell commands directly. David is the final human authority; no agent outranks that layer.

**Authority graph:** David → Constitution → Board → NOA/CECCA → Executives → Departments → Workers → Tools. Lower agents execute more; higher agents decide more and touch systems less.

**Operating rules that bind all execution (RULES.md §0–7, newest governance layer):**

- §0 Foundational Architecture: the Nix profile via Yazelix \+ Nix is the foundation binary and runtime model everything must adapt to; latest toolchain always; bun/bunx runs Node.js; the Cargo toolchain is managed via Nix, felix, kache, and the wild linker.  
- §2: Vision/Values immutable outside Annual Review; max 3 active Priorities; every Project links to ≥1 Priority; Actions atomic.  
- §3: ISO 8601 dates; projects named as completed states; statuses only \[BACKLOG\]/\[ACTIVE\]/\[BLOCKED\]/\[DONE — verification required\].  
- §4: stale \>14 days → BACKLOG or delete; "if it is not in the Inbox or Spine, it does not exist"; One-In-One-Out for new opportunities.  
- §6 GitHub protocol: only develop \+ main/master; worktrees disposable and removed after merge; always upgrade on edits/errors, no comment-outs; never leave a dirty branch or unmerged mergeable PRs; final proof \= git status \+ open-PR inventory \+ branch cleanup.  
- §7 Pipeline integrity: nu must be on PATH (env-control tables); bun is the exclusive executor of planning-spine verification; **system-of-record for the Task Graph is the committed CSV (generated/task\_graph.source.csv) — Sheets are visual-only**; every row needs proof\_uri or the build fails; `bun run planning-spine:verify` must pass before any commit/merge; PACKAGE\_MANIFEST.json regenerated after table-structure changes; Ubuntu 26.04+ build is the primary gatekeeper (no macOS/Windows until it succeeds).

---

## 1.5 COMPANY & CAPABILITY FRAME (ROOT doc — pristine baseline, no RUN STATE)

**Company:** Element Ark Holdings \= conglomerate holding company (ArkForge, ArkEnergy, ArkFab, DeFlex, iGuard Nexus, FlexNetOS, LifePodOS). David \= Owner/Founder/Human Principal. Target stack: **Rust \+ Lua** (mlua \= policy script / behavior selector / routing DSL; Rust \= compiled memory, vector math, safety gates, execution authority). MVP1 domain \= financial \+ legal (self-sustained growth). Goal is a bounded mandate, not a single metric.

**System roles:** NOA acts as CEO; Yazelix-Nix \= portable confined foundation; Hermes builds/operates the org (institutional memory); Odysseus \= David's personal command visibility/cockpit; Teri/Mirofish \= war room / DevWorld simulation; Meta coordinates GitHub; envctl \= canonical config truth; flexnetos\_runner \= build/proof/release executor; Runtime Kernel enforces law (identity, permissions, memory, audit, rollback, policy).

**Capability targets (10, from ROOT):** Weave multi-agent comms; Task layer (handoff \+ gitkb \+ rusty-idd); envctl regenerative configs; enc-ctl \+ vault\_hub \+ Cognitum seed (envctl as secret-broker "digital credit card"; vault \= Cognitum seed on a Pi Zero 2 W 64GB hosting secrets/CA/registry/wallet via KeyPassXL; broker holds long-life keys, relay keys rotated daily); self-learning self-driving architecture; local inference

+ training; mesh-net distributed compute/storage/memory/inference; network control; home automation ("Alexa on steroids" — bills, groceries, finances, media, stocks, legal); operated from AI glasses \+ phone (iPhone 15 \+ INMO XR G3).

**Memory model:** RuVector \+ Postgres \+ redb \+ graphdb engine; hot/warm/cold stages; failure-learning chain Raw Event → Failure Capsule → Causal Map → Scoped Lesson → Guardrail → Instinct. Simulation doctrine: "failure is terrain"; preserve the gold world, learn from every failed world, promote only proven worlds, never let a failed world become the new baseline. Mental model: the planning system is a compiler (intent → constraints → authority graph → simulated futures → task graph → hermetic action → proof → memory compression); Mirofish \= speculative execution ("branch predictor for work").

**Priority sequence (1–8):** Planning Spine v0 → Mirofish planning adapter → hermetic cell runner → Hermes integration → Odysseus/UI cockpit → Meta GitHub orchestration → company hierarchy expansion → home automation/real-world worlds. Explicitly NOT first: full Figma app, full Odysseus, full Hermes, full org chart, standalone Mirofish port.

---

## 2\. ARCHITECTURE — THE PLANNING SPINE (Spec §2–§18, v0 boundary)

**v0 boundary:** MVP-only flow — intent → authority graph → task graph → DevWorld simulation → hermetic cell → proof ledger → next-action recommendation. No full Hermes/Odysseus company hierarchy in v0; no standalone Mirofish; JSON Schema is the executable contract (YAML generated later, never source of truth). Company and Memory objects are defined but post-v0 (RFC).

**Object model (13 v0 schemas, at planning-spine-v0/schemas/):** Intent, Goal, Agent, Role, Capability, Task, Cell, WorldSeed, SimulationReport, ProofRecord, Decision, Action, Artifact. Key contracts:

- Task: owner, allowed\_paths, blocked\_paths, verification\_gate, rollback\_plan, status, proof\_uri (12 states: Draft…Complete/Rejected).  
- ProofRecord: task\_id, cell\_id, repo\_path, git\_head\_before/after, diff\_summary, test\_output\_uri, checksums, failed\_checks, rollback\_point, verifier\_agent.  
- Cell types: doc-cell | sim-cell | dev-cell | proof-cell | policy-cell | release-cell; network denied by default; read-only FS except writable\_paths; no mutation without snapshot; promotion simulation → dev-cell → proof-cell → release-cell. Yazelix-Nix is the portable execution law for cells.  
- SimulationReport updates the task graph as constraints, not advice; failed worlds become failure capsules, never new baseline truth.

**Execution gates (§11):** Approval requires bounded/reversible/evidence-sufficient; automatic Needs-Human-Approval for spend, legal, external real-world action, production mutation, account creation, credential handling, trading, physically-impactful home automation, anything irreversible.

**The §18 pipeline (canonical loop):** task graph (CSV) → extract-task-graph.py → normalize-task-graph.py → task\_graph.normalized.json → build-execution-packets.py → one bounded execution\_packets/\<TASK\_ID\>.json per Ready task → agent consumes ONE packet → proof\_records/\<TASK\_ID\>.proof.json → merge-proof-records.py (append-only proof\_ledger.jsonl) → update-task-graph-status.py. Three-surface rule: CSV/Sheet \= human control surface; JSON packets \= agent control surface; proof JSON \= reality control surface. Agent rule: no agent consumes the whole planning doc when a bounded packet exists.

**Communication & lanes (§19–§23):** Drive comments are a compact event bus only; durable state lives in Drive artifacts \+ local proof files; local-first heartbeat (agents 60s, helpers 2–5 min, ChatGPT polling ≤ hourly); Weave routes events but must never replace the task graph (control plane) or proof ledger (reality plane). Lanes: A \= spine pipeline (LPS-012…018 \+ OPS-001), B \= CONN-001 connector, C \= heartbeat \+ WEAVE-001, D \= CAP-001 priority lock. Control Note CN-005 (active): stop serial execution; parallel lanes; foreground sessions are dispatchers/pollers only.

**RFC-001 (DevWorld/Mirofish):** simulation output may not execute directly nor rewrite baseline state. **RFC-002 (Compiled Agent Brainpack):** immutable compiled base intelligence \+ mutable runtime overlay \+ promotion pipeline (validated overlay → next compiled brainpack); mlua as Lua policy surface over the Rust substrate; explicitly not to be implemented before v0 schemas/task-graph/cell/proof-ledger are stable.

**Reference repo fleet (spec References table):** FlexNetOS/{lifeos (core base), envctl (environment authority), meta \+ meta\_\* (orchestration plane), agent (worker layer), ccboard (board governance/veto), claude-plugins, codex-plugins, flexnetos\_runner (build/proof executor), handoff (state transfer), loop\_cli/loop\_lib, prompt\_hub, rusty-idd (identity/capability), teri (DevWorld adapter), weave (agent bus)}.

---

## 3\. RUVNET SYSTEM MAP — CONSOLIDATED CONCLUSIONS (runs 1–3; every run doc preserves the full prior-run body; the two parallel run-3 siblings are reconciled in §3.5.3)

**Scale:** 360 crates.io crates (owner user\_id 339999\) — 232 edge-resolved with 524 internal Cargo dependency edges; 197 public GitHub repos enumerated; ruvector monorepo \~200 workspace members (ruvix-\* kernel, rvf-\* container format, ruvllm, rvAgent, ruqu). All 126 formerly-pending historical repos classified in run 3 (118 README-verified, 8 no-README); none adds a new L0–L4 spine dependency.

**Layer model (L0 substrate → L5 interface) and topological install order (21 steps):**

- L0 substrate/kernel: QuDAG (post-quantum DAG comms: `cargo install qudag-cli`), sublinear solver, RVF on-disk format (`cargo add rvf-runtime`), optional RuVix kernel \+ RVM.  
- L1 memory/data: RuVector (`npx ruvector`; server \+ MCP), rulake memory lake, AgentDB (.rvf), agenticow branchable memory. redb is CONFIRMED embedded inside ruvector-core (+graph, router-core, tiny-dancer-core, helix-vault) — validating the "RuVector \+ Postgres \+ redb \+ graphdb" memory backbone.  
- L2 neural/compute: ruv-FANN \+ ruv-swarm, ruvllm local LLM (`cargo install ruvllm-cli`; CUDA passthrough proven: `cargo install ruvllm-cli --features cuda`), optional ruqu quantum.  
- L3 mesh/autonomous: DAA agents (`cargo install daa-cli`, uses QuDAG), Synaptic-Mesh (`npx synaptic-mesh`, uses QuDAG+DAA+FANN), MidStream QUIC, optional rvCSI sensing.  
- L4 orchestration: code-mesh coding agent, ruflo/metaharness meta-harness, agentic-flow orchestrator on top (`npx agentic-flow init`, 213 MCP tools), optional WeftOS constitutional kernel (weave-logic-ai/weftos, crates.io 0.6.12).  
- L5 apps: agentbbs, rupixel, wifi-densepose-core, nt-core (neural-trader), helix-pipeline.

**Wiring matrix (protocol plane):** MCP plane (stdio/HTTP) \= agentic-flow (213 tools), ruflo, metaharness, code-mesh, rvAgent, qudag-mcp, daa-mcp, ruv-swarm-mcp, agentbbs-mcp, ruvector mcp-gate/mcp-brain-server, rulake (hosted), sublinear-time-solver — all wireable into Claude Code / the weave runner as MCP servers. Post-quantum bus: qudag-crypto (ML-KEM/ML-DSA) underpins DAA \+ Synaptic-Mesh. QUIC transport: midstreamer-quic, qudag-network, ruvector sync. `.rvf` is the single shared on-disk memory artifact standard (AgentDB, ruvector snapshots, rvdna, rvf-server). FFI/NAPI for Node embedding: ruvector-node, daa-napi, nt-napi-bindings; WASM via \*-wasm crates. Verified autonomy composition: QuDAG → DAA → Synaptic-Mesh; FANN feeds the mesh via kimi-fann-core.

**npm layer (run 3):** agentic-flow v2.0.2-alpha ⇄ claude-flow v3.25.2 are mutually npm-dependent (a real cycle); both ride agentdb v3.0.0-alpha.17, which rides the @ruvector/rvf family; agenticow → @ruvector/rvf-node; flow-nexus \= npm 0.1.128 (`npx flow-nexus`); metaharness \= agent-harness-generator v0.1.0; ruvn \= @ruvnet/ruvn.

**Host GPU facts (dual RTX 5090, zero speculation):** ruvllm pins cudarc 0.19 (CUDA 13.0-native, SM 12.0 consumer Blackwell applies); build recipe `cargo build -p ruvllm --features inference-cuda,fused-act`; rvm-gpu backends: webgpu, cuda (via cuda-rust-wasm), opencl, vulkan, wasm-simd, metal. Ports: ruvector-server :6333 (Qdrant collision warning), SonicChamber :5184. helix repo GPU\_STATUS.md: ruvLLM v2.1.0 on :8080 with ollama :11434 fallback; ADR-026 done, 027–030 pending.

**Ecosystem census (run 3):** weave-logic-ai org \= 61 repos, only 5 originals (weftos, homebrew-tap, network-navigator, docs, knowlege-graph-agent); wifi-densepose is NOT a crates.io crate (404; the crate is wifi-densepose-cli; RuView holds archived v1); arcadia crate belongs to an external owner (Latias94) — excluded from the map.

---

## 3.5 RUN 4 — TWO COMPLEMENTARY THREADS (both consolidated; neither is a superset)

The lineage forked at run 3 (two near-simultaneous run-3 docs); each run-4 session picked a different parent. Verdict after normalized diff: the shared run-1/run-2 body is byte-equivalent; the threads are complementary and thread-scoped — census authority \= Doc A (1byp9v6E…, RUN STATE 06:20Z, 13/80 calls, forked from 1ACF4yNQ); substrate authority \= Doc B (1Fpy5TzOz…, RUN STATE 06:13Z, 31/80 calls, forked from 1b-RdkIYz).

### 3.5.1 Census thread closures (Doc A — declares "GAP: none open" on its thread)

- flow-nexus: npm tarball v0.1.128 is the sole public runtime source (103 files; Supabase \+ E2B \+ MCP-bridge client stack; bins flow-nexus/fnx/neural-trader; published gitHead absent from public repo history — rewritten/pruned).  
- @metaharness scope: 60 packages cataloged (kernel/sdk/harness/router/flywheel/darwin, 9 host adapters incl. host-rvm and host-hermes, 18 example packs); scope moves daily.  
- Rename proven: agent-harness-generator ≡ metaharness (GitHub 301, same repo id).  
- open-claude-code v2.0.0: bin `occ`, ink/react TUI, "based on ruDevolution decompilation of Claude Code v2.1.91".  
- weave-logic-ai fully classified: 56 forks \+ 5 originals; deep-read of the 2 TS originals still pending.  
- crates re-sweep: 360/360, no drift. Toolchain note: crates.io now rejects the default curl User-Agent — descriptive UA required.  
- New npm edge: @metaharness/kernel → @ruvector/emergent-time.  
- Run-5 pendings (census): 59 unfetched @metaharness packuments; metaharness repo post-rename deep-read; daily npm re-sweep; weave-logic-ai originals deep-read; flow-nexus tarball src/services/\* static read.

### 3.5.2 Host-substrate fit map (Doc B — observe-only run; zero mutations)

- Host: Ubuntu 26.04 LTS x86\_64 (not NixOS); Determinate Nix 3.21.1 (nix 2.34.7); home-manager not installed; lifeos\_foundation\_yzx built from path:/home/flexnetos/FlexNetOS/src/yazelix (fork at v17.5-452-gb44a148b; runtime variant mars; 38 declared tools / 46 toolbin commands; allowUnfree whitelists exactly \["claude-code"\]).  
- GPU truth: 2x RTX 5090 (32,607 MiB each), driver 610.43.02, **CUDA UMD 13.3** (supersedes the run-1 "CUDA 13.1" host note); /usr/local/cuda-13.3 with nvcc \+ libnvrtc.so.13.3 (nvcc off-PATH); ruvllm's cudarc 0.19 path satisfied by driver alone; fused-act needs nvrtc loader resolution (GAP h7).  
- Live services: Ollama owns :11434; :6333 (ruvector-server default) and :5432 are FREE — the baseline "RuVector \+ Postgres \+ redb \+ graphdb" memory line currently has no running Postgres leg (architecturally satisfied — redb embedded in ruvector-core — operationally partial). Claude Code 2.1.202 had an EMPTY MCP registry at observation: ruvnet MCP wiring is a green field via `claude mcp add`. Docker socket: permission denied (user decision pending).  
- nixpkgs probe: 0 of 10 ruvnet names exist in nixpkgs — every Rust component is a source build; npm components ride bunx or nix-provided node.  
- Fit-map verdicts: RuVix kernel \= VERIFIED-NONFIT on x86\_64 userspace; "the yazelix workspace IS the L5 surface" (verified, in use); most L0–L4 rows PARTIAL (mechanism proven, build unexercised); npm L1/L4 rows \+ SonicChamber blocked on GAPs h3/docker.  
- Integration doctrine (plan-binding): long-running services \= systemd-user units, NOT zellij panes; one custom\_popup per interactive CLI; config truth flows exactly two ways — settings.jsonc (yazelix surfaces) and envctl tables (service env: RULAKE\_*/RVCSI\_NX\_*/HELIX\_\*; rendering is PLAN, not present today); no third config location.  
- Host install addendum (5 steps, execution deferred to a proof-ledgered run): Rust CLIs via packaging/ruvnet\_\*.nix on the rtk\_release.nix template; ruvector-server as systemd-user unit on :6333; ruvllm impure cargo build with LD\_LIBRARY\_PATH=/usr/local/cuda-13.3/lib64; npm tier after GAP h3 then `claude mcp add`; docker tier blocked on group membership.  
- Open host GAPs h1–h7: in-session PATH unmeasured; docker socket; bunx-vs-node untested; pure-Nix CUDA untested; FlexNetOS/usr/bin provenance unmapped; 452-commit fork delta unitemized; nvrtc loader path unverified.

### 3.5.3 Lineage reconciliation (consolidator's finding)

Doc A calls 1ACF4yNQ "canonical run 3" and 1b-RdkIYz an unverified duplicate; Doc B calls 1b-RdkIYz the lineage tip. The evidence refutes the "duplicate create call" theory: the two run-3 docs differ substantively (18 vs 21 tool calls; wifi-densepose HTTP 301-renamed vs HTTP 200-standalone — consistent as a rename-then-recreate sequence; 119/7 vs 118/8 README split). Both run-3 docs are real, independent runs. RECOMMENDATION (run 5): declare THIS consolidated master plan the merge point; a run-5 map doc should take Doc A \+ Doc B jointly as baseline, close h1–h7 \+ the five census pendings, and record the merged lineage in its RUN STATE.

---

## 4\. UNIFIED TASK GRAPH (canonical, from both Task Graph sheets — read 2026-07-07)

Both sheets (original `1hqQ_FU3…` and COMMENT RESET `1LYeO7PA…`) render content-identical as of 2026-07-07: 27 rows, 16 Ready / 11 Complete. COMMENT RESET is the ACTIVE control surface (per operating memory); the original is its pre-reset twin.

### 4.1 Foundation / schema / gates track — status Ready (12 rows, proof\_uri EMPTY)

| task\_id | phase | title | owner | target artifacts |
| :---- | :---- | :---- | :---- | :---- |
| LPS-000 | 0-foundation | Canonical naming \+ scope lock | CECCA | 00\_NORTH\_STAR.md; README.md |
| LPS-001 | 1-schema | Object model schemas | CTO Agent | 01\_OBJECT\_MODEL.md; schemas/object\_model.yaml |
| LPS-002 | 1-schema | Authority graph contract | Governance Board | 02\_AUTHORITY\_GRAPH.md; schemas/authority\_graph.yaml |
| LPS-003 | 1-schema | Task graph schema | CTO Agent | 03\_TASK\_GRAPH\_SCHEMA.md; schemas/task\_graph.yaml |
| LPS-004 | 2-simulation | WorldSeed schema | Teri/Mirofish | 04\_WORLDSEED\_SCHEMA.md; schemas/worldseed.schema.json |
| LPS-005 | 2-simulation | SimulationReport contract | Teri/Mirofish | RFC-001\_DEVWORLD\_MIROFISH\_ADAPTER.md; schemas/simulation\_report.schema.json |
| LPS-006 | 3-execution | Hermetic cell contract | Runtime Kernel | 05\_HERMETIC\_CELL\_CONTRACT.md; schemas/cell.schema.json |
| LPS-007 | 3-execution | Proof ledger schema | QA Agent | 06\_PROOF\_LEDGER.md; schemas/proof\_record.schema.json |
| LPS-008 | 4-mvp | MVP vertical slice | NOA/CECCA | 07\_MVP\_VERTICAL\_SLICE.md; tasks/mvp\_envctl\_update.csv |
| LPS-009 | 5-gates | Execution gates | Governance Board | 08\_EXECUTION\_GATES.md; schemas/gates.yaml |
| LPS-010 | 6-rfc | Compiled brainpack RFC | Hermes/Memory Agent | rfcs/RFC-002\_COMPILED\_AGENT\_BRAINPACK.md |
| LPS-011 | 7-review | Open questions register | NOA/CECCA | 09\_OPEN\_QUESTIONS.md |

OBSERVED REALITY CHECK (local repo, 2026-07-07): the target planning files 00\_NORTH\_STAR.md … 09\_OPEN\_QUESTIONS.md \+ README.md all EXIST at `src/lifeos/planning-spine-v0/` — the artifacts exist but the rows remain Ready because their proof\_uri cells are empty. This is the live-sheet normalization blocker (§7).

### 4.2 Execution-pipeline \+ state/runtime-proof track — status Complete (11 rows, proofs on ledger)

LPS-012 extractor · LPS-013 normalizer · LPS-014 packet builder · LPS-015 packet validator · LPS-016 proof-ledger merge · LPS-017 status projection · LPS-018 execution bundle (revision 4 authoritative) · LPS-019 current-state map · LPS-020 verification frontdoor (bun run planning-spine:verify passes) · LPS-021 connected MVP bundle · LPS-022 verifier authority integrity. All carry proof\_records/LPS-0NN.proof.json.

### 4.3 Parallel lanes — status Ready, proofs already materialized and now IN GIT

| task\_id | lane | title | state on disk (2026-07-07) |
| :---- | :---- | :---- | :---- |
| CONN-001 | connector-build | ChatGPT local Codex connector | connector\_state/\* \+ connector\_proof/CONN-001.proof.json committed |
| OPS-001 | ops-heartbeat | Local heartbeat watcher | heartbeat\_lane\_a/b.json \+ docs/heartbeat\_notes.md committed |
| WEAVE-001 | ops-weave | Evaluate FlexNetOS/weave as agent bus | weave\_state/weave\_bus\_evaluation.{md,json} committed |
| CAP-001 | p0 | Priority lock | capability\_state/p0\_priority\_report.{md,json} committed |

All four lanes' artifacts and proof records were committed to lifeos main on 2026-07-07 (commit 4bc8866, merged via PR \#7 as 0469b30) after gates passed (planning-spine:verify ✓, bun test 218/218 ✓, bun build ✓).

CAP-001 PRIORITY LOCK (the plan's own p0): finish the communication-bridge workstreams (CONN-001, OPS-001, WEAVE-001) before expanding architecture. Weave \= event bus only; the task graph remains the control plane.

---

## 5\. ENVCTL MIGRATION AUTOMATION PACKAGE

**What it is:** an executable planning/control prompt package (generated 2026-07-04T17:45Z; entry CODEX\_FINAL\_EXECUTION\_PROMPT.md) that extends the earlier codex-flexnetos-migration-prompt-package into an additive implementation plan for two repos: envctl database tooling (durable source of truth: event ledger, artifact store, replay, approvals, validation, reproducibility) and the nu\_plugin CLI/user layer (status, approvals, artifact browsing, graph views as controlled commands). Execution model: Codex locally on Ubuntu 26.04+ against the REAL repos via RUN\_WITH\_CODEX\_ENVCTL.sh; no assumed repo layout — inspect before editing.

**Strategy (contract-first, parallel):** lock the migration artifact contract → add envctl DB (tables, event sourcing, target descriptors, recipes, evidence, approvals, checkpoints, rollback, replay, validation) → thin envctl adapter running the prior package as an external bundle → in parallel, nu\_plugin protocol/commands reading from and appending controlled actions into envctl's DB → replace shell collectors with native envctl collectors only after the adapter proves parity.

**Non-negotiables:** no simulation; no fabricated repo structure; no invented DB backend; no destructive migrations without explicit approval; no secret exposure; every decision backed by inspected repo evidence; envctl DB is the durable source of truth; nu\_plugin is a controlled command/visualization surface only.

**Plan state (load-bearing):** 76 tasks \= 76 packets across phases 00-framework (8) → 01-contract → 02-envctl-db → 03-nu-plugin → 04-shared → 05-artifacts (37 ART-100…126 tasks mapped 1:1 to the migration artifact contract) → 06-flexnetos → 07-verification → 08-release, across 7 owner lanes. The 8 framework/bootstrap tasks (EF-001…008) are COMPLETE with proofs on the package's own proof\_ledger.jsonl; **68 implementation tasks are PENDING by design, 0 failed, exactly 1 runnable: REQ-010\_CONTRACT\_LOCK.** FINAL\_HANDOFF\_NOTE: "Use the corrected downloadable package archive. The root file CODEX\_FINAL\_EXECUTION\_PROMPT.md is the execution entry."

**Pre-execution debt (DEEP\_VERSION\_GAP\_ANALYSIS 2026-07-04, status PASS\_WITH\_LIVE\_DRIVE\_BOOKKEEPING\_GAPS):** final\_verification\_report still carries a stale pass\_with\_external\_blocker (Drive write access has since been proven — DRIVE\_SCAN\_VERIFICATION: PASS with stale-blocker note); live README nav/backtrace edits and the restored PROOF\_RECORD\_TEMPLATE are not yet in the task graph/proof ledger; two MAINT packets recommended but not created; PACKAGE\_MANIFEST.json (111 files, 401,203 bytes, per-file sha256) manifests only the original generated package — it omits execution-framework/, execution-templates/, history/, and the root execution prompt. Required reconciliation before execution: regenerate package\_scan / final\_verification\_report / status\_report / PACKAGE\_MANIFEST, add the two MAINT packets \+ proofs.

**Relationship to the local repos (2026-07 audit \+ this session):** a sibling embedded copy lives inside FlexNetOS/src/envctl (80/80 packets schema-valid; 6 proof records schema-failing — 4 MAINT-50x evidence-shape \+ 2 REQ-033/034 model\_tag — with a prepared MAINT-504 fix prompt; stale local PACKAGE\_MANIFEST). The envctl and nu\_plugin (CodeDB) repos are both clean and fully merged as of 2026-07-07; nu\_plugin ships in the Yazelix profile as codedb \+ nu\_plugin\_codedb, so the plugin surface this package targets is already installed runtime.

---

## 5.5 HOST SUBSTRATE STATE (proven 2026-07-07, this machine)

The plan's execution substrate (Yazelix/Nix foundation, RULES §0) was repaired and proven end-to-end on 2026-07-07 (raw logs: FlexNetOS/var/log/raw/\*\_20260707.log):

- Frontdoor: \~/.nix-profile/bin/yzx → lifeos-foundation-yzx; profile entry lifeos\_foundation\_yzx from path:…/src/yazelix; `yzx doctor` all checks passed.  
- Rebuild loop effectively instant: `yzx update upstream` 33s; warm `nix develop .#ci` 0.73s; warm `cargo check` (rust\_core) 0.79s; kache 0.8.0 wired via kache-rustc-wrapper; wild present, deliberately unwired (gcc \-fuse-ld caveat).  
- Toolchain proven from profile closure (699 store paths): ccboard 0.24.0, rtk 0.43.0, claude 2.1.202, codex 0.143.0-alpha.35, git-kb 0.2.12, codedb 0.1.0 \+ nu\_plugin\_codedb, lazygit 0.62.2, nu 0.113.1, yazi 26.5.6, zellij 0.44.3.  
- bun/bunx/kache/wild/envctl are meta/envctl-owned frontdoors at FlexNetOS/usr/bin — by design, not drift. `nu` for envctl tables lives in the profile toolbin (not login PATH).  
- All five peer repos (yazelix, yazelix-yazi-assets, ccboard, nu\_plugin, lifeos) are clean, fast-forwarded, and fully merged as of 2026-07-07 (yazelix HEAD eaa64542).  
- Known cosmetic gap: flexnetos not in Nix trusted-users (sudo one-liner recorded in LOCAL\_WORKAROUNDS.md); substitution works regardless (daemon-trusted cachix in /etc/nix/nix.custom.conf).

---

## 6\. DECISIONS & INVARIANTS LEDGER (cross-source, newest-first)

1. Committed CSV (generated/task\_graph.source.csv) is the task-graph system of record; Sheets are visual-only (RULES §7 — supersedes Spec §12/§23 sheet-centric control).  
2. JSON Schema is the executable contract for v0; YAML never source of truth (Spec §17).  
3. Proof closes reality: no proof, no completion; proof records append-only (Spec §10, §18; ROOT proof doctrine).  
4. Simulation writes constraints, not advice; failed worlds become failure capsules (Spec §8, RFC-001; ROOT).  
5. Yazelix-Nix profile is the foundation binary/runtime model everything adapts to (RULES §0); proven healthy on this host 2026-07-07 (§5.5).  
6. Weave routes events only; task graph remains control plane; proof ledger remains reality plane (Spec §21; WEAVE-001 gate).  
7. CEO agent proposes/delegates, never executes raw shell (Spec §6; ROOT authority rule).  
8. bun is the exclusive planning-spine verify executor; verify must pass before any commit/merge (RULES §7) — enforced in practice on 2026-07-07 (lifeos PR \#7 gates).  
9. Parallel lanes over serial execution; foreground sessions are dispatchers/pollers only (CN-005).  
10. RFC-002 brainpack not to be implemented before v0 schemas/task-graph/cell/proof- ledger are stable.  
11. Drive planning docs are append-only lineage; ROOT and prior run docs are the archive (ruvnet map missions; observed practice runs 1–4).

## 7\. GAPS, RISKS, CONTRADICTIONS (surfaced, not resolved silently)

1. **Sheet vs CSV control surface:** Spec §12/§23 name the COMMENT RESET sheet as the active control surface; RULES §7 declares the committed CSV canonical with Sheets visual-only. Operational reality (2026-07 audit): pipeline reads the committed CSV (11 rows) while the live sheet has 27 rows — the two have diverged. NEEDS OWNER DECISION: promote the 27-row sheet content into the committed CSV, or declare the CSV's 11-row scope intentional.  
2. **Live-sheet normalization blocker:** the 12 Ready foundation rows (LPS-000…011) have empty proof\_uri; the normalizer requires proof\_uri on every row, so the live sheet cannot be normalized as-is — even though their target artifacts (00–09 docs, README) already exist locally. Either backfill proof records for the existing artifacts or mark rows per the CSV convention.  
3. **Parallel run-3 lineage split:** two complete run-3 docs exist (1b-RdkIYz… 05:44Z, 82,669 chars, 21/80 calls, 118 historical verified; 1ACF4yNQ… 05:43Z, 86,485 chars, 18/80 calls, 119 verified) written by near-simultaneous sessions from the same run-2 baseline. Divergent findings to reconcile: wifi-densepose (standalone repo newly exists vs archived-in-RuView via 301 redirect — both can be true: redirect implies rename/extraction), flow-nexus npm source (GAP in one, version 0.1.128 in the other), historical counts 118 vs 119, and 1ACF4yNQ's banner still reads "(run 2)". Two run-4 docs continue the split (06:10 \~30KB; 08:57 \~50KB). This consolidation merges both branches; future runs should nominate ONE canonical branch and mark the other docs as archive siblings (never delete).  
4. **Two ProofRecord shapes coexist:** schemas/proof-record.schema.json (subject/hash/verifier) vs operational proof\_records/\*.proof.json (lifeos-planning-spine.proof-record.v0: task\_id/status/commands/artifacts, no git heads). Unify or version explicitly (also flagged in the 2026-07 audit; envctl package had 6 schema-failing proofs → MAINT-504 fix prompt exists).  
5. **envctl "canonical config truth" is aspirational:** ADR-0003 status=proposed; catalog sync \--apply fail-closed; no CI gate. Render proven byte-deterministic.  
6. **nu on PATH (RULES §7)** vs reality: nu ships in the profile toolbin (runtime env adds it), not on the bare login PATH — envctl table regeneration outside a Yazelix session may still fail. Wire login PATH or run table jobs inside the runtime env.  
7. **Nix trusted-users gap (cosmetic):** flexnetos not in trusted-users; sudo one-liner recorded in LOCAL\_WORKAROUNDS.md 2026-07-07; substitution works regardless.  
8. **CN-003/CN-004:** local sessions had not ACKed the reset sheet as written (spec- declared outstanding item).  
9. **Open Questions register (Spec §15, 10 items)** remains open — owning repo, task-graph store (CSV vs SQLite vs redb vs Postgres), YAML-vs-JSON first for WorldSeed, Nix-only vs \+Linux policy enforcement, Meta↔proof-ledger bridge, Odysseus licensing posture, Mirofish integration depth, Hermes v0 features, canonical execution folder, first proof-producing envctl command.

## 8\. NEXT ACTIONS (priority-ordered; CAP-001 lock honored)

P0 (CAP-001 priority lock — communication bridge before architecture expansion):

1. CONN-001: drive the ChatGPT↔local Codex connector to a live usable connection or an explicit documented blocker (artifacts \+ proof already committed to lifeos main).  
2. OPS-001: local-file-first heartbeat running on all active lanes (lane A/B files committed; keep them fresh).  
3. WEAVE-001: finish the weave-bus evaluation verdict (evaluation artifacts committed; decision pending) — event bus only. P1 (unblock the spine):  
4. Resolve contradiction \#1 (sheet↔CSV) and \#2 (proof\_uri backfill) so the live task graph can normalize again; then resume LPS-000…011 closure with proof records.  
5. MAINT-504: repair the 6 schema-failing proof records in the envctl migration package (prepared fix prompt exists); regenerate PACKAGE\_MANIFEST.json (Rule of Manifest Freshness). P2 (lineage hygiene):  
6. Nominate the canonical ruvnet-map branch (recommend: newest 08:57 run 4 as baseline for run 5), mark siblings as archive in their own RUN STATE successor, reconcile the named divergences (§7.3).  
7. Address Spec §15 open questions with owner decisions (each has owner \+ unblock condition per LPS-011 gate).

---

## 9\. PROVENANCE APPENDIX

### 9.1 Scope interpretation ("the 16 planning files")

Observed candidates, all fully covered by this consolidation: (a) the 10 URL-listed Drive files \+ the 6 top-level files of the envctl migration package folder \= 16 Drive files; (b) the Task Graph's 16 Ready rows (12 foundation \+ 4 parallel lanes), all in §4; (c) the canonical planning files in planning-spine-v0 (00–09 \+ README) plus generated control surfaces. GAP: the exact intended referent of "16" was not stated by the owner; recorded here rather than guessed silently.

### 9.2 Source inventory and disposition (folder 1Zo3vp1qciVen1MmPjMm3x1nKmoJvR0ej)

| \# | file | id (head) | disposition |
| :---- | :---- | :---- | :---- |
| 1 | Executable Spec (READ-ONLY input; mod 2026-07-07 09:20) | 1G2wBHIl9 | consolidated §1–2, §6–8; embeds run-2 map \+ RULES.md |
| 2 | lifeos-planning-spine v0 (ROOT baseline, no RUN STATE) | 1rXdcUi26 | consolidated §1, §1.5, §2 |
| 3 | ruvnet map run 1 (11,956 B) | 1X7\_EHZkZ | content preserved verbatim inside every later run doc; consolidated via §3 |
| 4 | ruvnet map run 2 (20,743 B) | 1QLejo5wZ | same — run-2 addendum consolidated via §3 |
| 5 | ruvnet map run 3 — first write, 05:43Z RUN STATE, 18 calls | 1ACF4yNQ- | consolidated §3, §3.5.3; census-branch parent |
| 6 | ruvnet map run 3 — second write, 05:44Z stamp, 21 calls, read-back verified | 1b-RdkIYz | consolidated §3; substrate-branch parent |
| 7 | ruvnet map run 4 — census thread (RUN STATE 06:20Z) | 1byp9v6E- | consolidated §3.5.1 |
| 8 | ruvnet map run 4 — host substrate thread (RUN STATE 06:13Z, written 08:57Z) | 1Fpy5TzOz | consolidated §3.5.2, §5.5 cross-proof |
| 9 | Task Graph (sheet, archive per Spec §23) | 1hqQ\_FU3l | consolidated §4 (content-identical twin) |
| 10 | Task Graph COMMENT RESET (sheet, ACTIVE surface) | 1LYeO7PA6 | consolidated §4 (canonical read) |
| 11–16 | migration package: README.md, FINAL\_HANDOFF\_NOTE, DEEP\_VERSION\_GAP\_ANALYSIS, DRIVE\_SCAN\_VERIFICATION, PROMPT\_PACKAGE\_COMBINED.md, PACKAGE\_MANIFEST.json | folder 1Db8JB2\_z | consolidated §5 |
| — | GitKB Docs 01–19 (clean) \+ tool zips | folder 1F3f2KcZ\_ | referenced tool-documentation library; not planning content |
| — | Ubuntu-26.04+\_$HOME\_Mirror; Sherlock-it; capsule\_model\_starter zip (2025-09) | — | out of planning scope; listed for completeness |

### 9.3 Local runtime cross-references (proof surfaces cited by this plan)

- src/lifeos/planning-spine-v0/ — canonical planning files 00–09 \+ README, schemas (13), scripts (7), proof\_records (21 incl. ledger), generated control surfaces; all committed to main as of 2026-07-07 (PR \#7 merge 0469b30).  
- FlexNetOS/var/log/raw/\*\_20260707.log — Yazelix/Nix substrate repair raw evidence (§5.5).  
- FlexNetOS/LOCAL\_WORKAROUNDS.md (2026-07-07 entry) — host-state changes \+ pending trusted-users fix.

### 9.4 Consolidation integrity statement

No source file was modified, renamed, or deleted. The protected Executable Spec was read (explicitly listed as a consolidation input by the owner) and never written. Conflicts were resolved newest-verified-first and every unresolved contradiction is listed in §7. This document supersedes no source; it is the merge point the lineage lacked.  
