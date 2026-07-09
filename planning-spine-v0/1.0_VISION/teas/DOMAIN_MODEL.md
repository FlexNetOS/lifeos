# TEAS — Domain Model (DDD)

**Task Execution Automation System.** The bounded-context model that unifies six existing task
systems into one governed engine. Anchor: `1.0_VISION/NORTH_STAR.md`. Method: Domain-Driven Design —
one ubiquitous language, explicit bounded contexts, a context map, and anti-corruption layers at every
seam. Every claim here is grounded in a real build/inventory of the source repos (2026-07-07); no
aspirational component is described as if it exists.

---

## 1. The domain, in one sentence

Convert human **intent** into a **governed, provable task graph**, select the next **ready** task,
execute it inside a **gated** boundary, and close it only with a **witnessed proof** — accumulating
**learning** every cycle.

## 2. Ubiquitous language — canonical glossary + reconciliation

The systems grew apart and named the same concepts differently. TEAS adopts **one** canonical term per
concept; adapters translate at the boundary (§7).

| Canonical term | Definition | Source-system synonyms (reconciled) |
|---|---|---|
| **WorkOrder** | The unit-of-work aggregate; schema `handoff.task.v1`. | handoff `WorkOrder` · rusty-idd `WorkOrder`/`change` · gitkb `doc(type=task)` · ruflo/rvAgent `Task`/`TaskSpec` · exec-framework CSV row · prompt_hub `ExecutionStep` |
| **IntentLock** | Value object: 5 blake3 hashes pinning the immutable contract surface. | handoff `IntentLock` · rusty-idd `IntentLock` (mirror) |
| **Intent** | Classified human request before it becomes WorkOrders. | prompt_hub `Intent` · handoff `Intent::classify` · rusty-idd intake |
| **Selection / Ready** | Deterministic pick of the next dispatchable WorkOrder. | gitkb `ready`/`board`/`graph plan` · exec-framework goal-loop `runnable` · rvAgent `Router` |
| **Claim / Lease** | Atomic single-holder ownership of a WorkOrder. | handoff `claim`/`lease` (weave CAS) · gitkb `assign` (CAS) |
| **Gate** | Fail-closed policy verdict guarding a transition. | handoff policy/drift/gatekeeper · exec-framework `completion_gate`/approval gate · rusty-idd artifact gate · cognitum `permit/defer/deny` |
| **ProofRecord** | Evidence-with-checksum that a WorkOrder ran and passed. | handoff witnessed `LedgerEvent` · exec-framework `*.proof.json` · planning-spine `proof-record` |
| **Ledger** | Append-only authority for current state (proof overrides claims). | handoff redb `ledger.db` + witness chain · exec-framework `proof_ledger.jsonl` |
| **Runner / Executor** | The thing that executes a WorkOrder. | rvAgent `TaskRunner`/`InMemoryRunner` · rusty-idd headless `run` · ruflo swarm agent |
| **Trajectory / Pattern** | Captured experience + distilled lesson (learning). | ruvector `sona` `Trajectory`/`ReasoningBank`/`LearnedPattern` |
| **Cell** | Hermetic execution boundary (Nix closure, FS/network policy). | planning-spine `Cell` · handoff world (Gold/Sandbox/Candidate/Failed) |

## 3. The canonical aggregate — `WorkOrder` (schema `handoff.task.v1`)

**Aggregate root.** Origin: `handoff/work-order/src/lib.rs:57`; faithful mirror: `rusty-idd
crates/work-order`. Executable schema: `teas/schemas/task_graph.schema.json`.

- **Identity:** `id` (regex `^[A-Z]*TASK-[A-Z0-9][A-Z0-9-]*$`), `schema="handoff.task.v1"`,
  `correlation_id` (cross-system handle = upstream `SwarmBundle.workflow_id`).
- **Intent surface (contract):** `title`, `objective`, `path_scope[]`, `acceptance_criteria[]`,
  `test_commands[]` — the fields a raw prompt lacks and a gate needs.
- **Value object `IntentLock`** (`work-order/src/lib.rs:106`): `objective_hash`, `path_scope_hash`,
  `acceptance_hash`, `constraint_hash`, `northstar_revision` — each serialized in **`blake3:<hex>`** form
  (`work-order/src/lib.rs:138`), not bare hex. **Invariant:** a downstream verifier recomputes these; any
  mismatch = **drift** and the WorkOrder is refused. Legacy 3-hash locks round-trip byte-identically
  (no-downgrade, Law 2). (The ledger `action_hash` is by contrast a raw 32-byte hash — `ledger/src/v1.rs:164`.)
- **Policy flags:** `allows_network`, `allows_dependency_addition`, `human_approval_required`,
  `risk_level`.
- **Scheduling:** `priority` (P0–P3), `dependencies[]`, `blocked_by[]`/`blocks[]`, `parallel_group`,
  `max_parallel`, `owner_lane`.
- **Lifecycle `Status`** (`work-order/src/lib.rs:20`): `Backlog → Active → Claimed → Blocked →
  Checkpointed → Review → Done`. **Invariant:** status is authoritative *from the ledger by replay*,
  never from the card (`ledger/src/v1.rs:828 replay_latest_status`). State precedence: **Git > ledger >
  tasks/*.task.json > active.md > packet.**

## 4. The reality plane — `ProofRecord` + `Ledger`

- **ProofRecord** (canonical: `teas/schemas/proof_record.schema.json`) reconciles handoff's witnessed
  `LedgerEvent` (`seq, ts_ns, event_type, work_order_id, payload_json, action_hash:blake3`) with
  exec-framework's `*.proof.json` (`status, actor, files_changed[], commands_run[], verification_output,
  checksums{path→sha256}, rollback_point, evidence[], next_action`). One record, one schema, versioned.
- **Ledger** = handoff's **redb append-only log** with a blake3 **witness chain**
  (`verify_witness_chain`, `v1.rs:869`) + replay + cross-repo rollup provenance. A v2 RVF/HNSW overlay
  (`ledger/src/v2.rs`) gives semantic recall over history. **Doctrine (proven in code):** proof status
  *overrides* any card/CSV claim (`exec-framework goal_loop.py:158-165`). No proof, no Done.

## 5. Bounded contexts (8)

Each context owns its model and exposes a **published language** at its edge. None reaches into
another's internals.

1. **Intent / Front Door — `prompt_hub`.** Owns `Prompt`, `Intent`, `ExecutionPlan`/`ExecutionStep`,
   `SwarmBundle`. Captures human intent (text/voice/screenshot). *Gap:* no emitter to WorkOrders — the
   biggest greenfield adapter (§7, §9).
2. **Selection / Knowledge — `gitkb`.** Owns the typed doc/task corpus + dependency graph. Published
   language: `ready --json` (scored), `graph --format plan` (topo order), `assign` (CAS). Consumed as a
   released binary (`git-kb 0.2.12`), not built here.
3. **Contract / Spec / Governance — `rusty-idd`.** Owns OpenSpec `change` lifecycle, `next` oracle,
   IntentLock authoring, render/deploy adapters, `.idd/evidence/*` triples. The "is this allowed / is
   intent unchanged / what's the spec" plane.
4. **Execution Kernel (CORE) — `handoff`.** Owns the `WorkOrder` aggregate, the witnessed `Ledger`, the
   fail-closed gate engine (write/network/dependency/drift/action/merge), the atomic `Lease` engine, and
   the `hf-mcp` (38 tools) + `hooks.toml` lifecycle surfaces. Already path-deps the ruvector brain.
5. **Dispatch Substrate — `meta`.** Owns `Project` + `Worktree` aggregates, the subprocess **plugin
   protocol** (planner→executor split), `loop_lib` parallel runner, MCP bridge. The multi-repo substrate
   TEAS runs *on*. Deliberately has no Task aggregate.
6. **Runtime / Swarm Fabric — `ruflo` + `rvAgent`.** ruflo (claude-flow 3.10.43) = the swarm/topology
   execution fabric (lacks a scheduler). rvAgent (`meta-ruvector/crates/rvAgent/*`) = the Rust-native
   engine: `AgentGraph` + `TaskRunner`/`Router` + `SubAgentOrchestrator` + budget/recursion guards.
7. **Learning / Memory — `meta-ruvector` `sona` + `.rvf`/AgentDB.** Owns `Trajectory`, `ReasoningBank`,
   `LearnedPattern`, HNSW recall, witness-linked `.rvf` persistence. Cross-cutting; captures every cycle.
8. **Batch Pipeline — `execution-framework`.** Owns the proven CSV→packet→proof three-surface batch mode
   (80/80 tasks green today). The "boil a large backlog" path; complements the live single-WorkOrder path.

## 6. Context map (relationships & DDD patterns)

```
                         [Intent/Front Door: prompt_hub]
                                     | (Customer/Supplier; ACL emits WorkOrders)
                                     v
   [Contract/Governance: rusty-idd] --Shared Kernel: handoff.task.v1 + IntentLock-- [CORE: handoff]
                                     ^                                                  |  ^
   (Conformist: TEAS conforms to    |                                          (Partnership) |
        gitkb ranking)               |                                                        |
   [Selection: gitkb] --Published Language: ready/plan/assign--> [CORE: handoff claim/lease]  |
                                     |                                                  |      |
                                     v                                                  v      |
                        [Runtime: ruflo + rvAgent] --implements TaskRunner--> [Learning: sona/.rvf]
                                     |                                                  ^
                              (runs on)                                                | (writes trajectory)
                                     v                                                  |
                        [Dispatch Substrate: meta plugin/loop] ----------------- [Reality: handoff Ledger]
                                                                                        ^
                        [Batch Pipeline: execution-framework] --proof records--> ------+
```

DDD patterns at each seam:
- **Shared Kernel:** `handoff.task.v1` + `IntentLock`, co-owned by handoff (origin) and rusty-idd
  (mirror). Change is coordinated, versioned, no-downgrade.
- **Published Language:** gitkb (`ready`/`plan`/`assign` JSON), handoff (`hf-mcp` 38 tools + JSON
  contracts), meta (plugin protocol). TEAS consumes these as stable contracts.
- **Anti-Corruption Layer (ACL):** every producer/consumer boundary that isn't already the shared kernel
  — especially prompt_hub→WorkOrder and exec-framework proof↔ledger (§7).
- **Conformist:** TEAS conforms to gitkb's scoring model (does not re-implement selection).
- **Partnership:** handoff ↔ meta-ruvector (`sona`/`rvf`/`cognitum`), already coupled by path-dep.

## 7. Anti-corruption seams (the concrete adapters to build)

| Seam | From → To | Contract | State today |
|---|---|---|---|
| **S1 Front-door** | prompt_hub `ExecutionPlan` → `WorkOrder[]` | emit `handoff.task.v1` rows (fill `owner_lane, model_tag, path_scope, verification_command, proof_uri`) | **Missing** — greenfield (zero grep hits) |
| **S2 Selection** | gitkb `ready --json` → handoff `claim` | slug+context → WorkOrder id + lease | Both sides exist; wire is thin JSON |
| **S3 Runner** | handoff WorkOrder → `rvagent-engine` | `impl rvagent-a2a::TaskRunner`; `TaskSpec.skill` routes | **New engine crate** (build target) |
| **S4 Proof** | any runner → handoff `Ledger` | write canonical `ProofRecord`; witness chain | Kernel exists; unify proof shape |
| **S5 Batch↔Live** | exec-framework `proof_ledger.jsonl` ↔ handoff redb ledger | one versioned `ProofRecord` schema | schema unified in build `TEASTASK-003`; runtime mirror reconcile **deferred post-v1** (§9.2) |
| **S6 Learning** | runner cycle → `sona` `ReasoningBank` | trajectory step + reward → pattern | Wired in `rvagent-middleware` |

## 8. Where we build (the load-bearing decision)

New workspace member **`meta-ruvector/crates/rvAgent/rvagent-engine`** that:
1. **implements `rvagent-a2a::TaskRunner`** (`executor.rs:31`) — the existing `Router`, `PeerRegistry`,
   `GlobalBudget`, and `recursion_guard` compose around it for free;
2. speaks the **shared kernel** (`handoff.task.v1` WorkOrder in, canonical `ProofRecord` out);
3. reuses `rvagent-core::AgentGraph`, `rvagent-subagents::spawn_parallel`, `sona::ReasoningBank`,
   and `rvf`/AgentDB — **no parallel task type**.
It lives under `crates/rvAgent/` so it inherits that family's already-green build; it *depends on*
`rvf`/`rvm` but does not live inside those excluded workspaces.

**Path-rooting convention (for `path_scope` in the build task-graph):** all `path_scope` entries are
rooted at the **lifeos workspace root** (`/home/flexnetos/lifeos`) — peer repos as `src/<repo>/…`, the
app repo (and these vision artifacts) as `lifeos/…`. This is what `IntentLock.path_scope_hash` binds and
what the write-gate enforces, so the rooting must be single and exact.

## 9. Contradictions to HEAL (surfaced, not silently resolved — Law 3)

1. **Two task-graph schemas** — exec-framework 40-col CSV vs planning-spine-v0 17-col CSV. → **Resolve:**
   canonical `task_graph.schema.json` (§ this dir) is the superset; both CSVs become projections of it.
2. **Three proof shapes** — handoff witnessed ledger vs exec-framework `proof_ledger.jsonl` vs
   planning-spine `proof-record.schema.json`. → **Resolve:** one versioned `proof_record.schema.json`;
   handoff redb ledger is the authority, JSONL is an export mirror.
3. **Two task aggregates in rusty-idd** — `WorkOrder` (interchange) vs OpenSpec `change` (authoring). →
   **Resolve:** WorkOrder is the runtime interchange; OpenSpec `change` stays the spec-authoring front for
   the Governance context (they bridge via `correlation_id`).
4. **Dual-workspace shadow** — `src/Cargo.toml` (`FlexNetOS/meta` v0.2.25) vs `src/meta/Cargo.toml`
   (`gitkb/meta` v0.2.22) breaks `agent/`. → **Resolve:** a consolidation migration (tracked as a TEAS
   build task) collapses to one workspace, superset-merged.
5. **ruvector task slice is `cargo check`-green but not `clippy -D warnings`-green**; `rvf`/`agent-memory`
   are workspace-excluded. → **Resolve:** `rvagent-engine` must land CI-green (clippy-clean) from day one;
   excluded deps are consumed via their own workspaces, not by un-excluding them.
6. **The origin `handoff.task.v1` struct does not yet emit the full canonical superset** — the current
   `handoff/work-order` struct lacks `rollback_plan`, `proof_required`, `owner_lane`, `model_tag`,
   `risk_level`, and the lane/parallel scheduling fields that `task_graph.schema.json` defines. → **Resolve:**
   the canonical schema is the target; handoff's struct **converges** to it (schemars-regenerated from the
   schema, superset/no-downgrade — Law 2), and until then producers/adapters fill the missing fields. At the
   schema layer `rollback_plan`/`proof_required` are optional so real current WorkOrders still validate; the
   "no task without a rollback plan / no Done without proof" invariants are enforced at the gate + ledger
   layer, not by schema-required-ness. `const handoff.task.v1` denotes the **healed profile**, not the
   present struct shape.

## 10. Published language (executable contracts)

The canonical schemas that make this model executable live beside this file:
- `teas/schemas/task_graph.schema.json` — the WorkOrder / task-graph row (heals §9.1).
- `teas/schemas/proof_record.schema.json` — the ProofRecord (heals §9.2).

These are the single source of truth. Rust types (`schemars`-derived) and CSV projections are generated
from them, never hand-maintained in parallel.
