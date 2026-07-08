# LifeOS — North Star (Canonical Anchor v1)

> **The one rule:** anchor the North Star, then think small, act small. Every task in this
> workspace must trace, in one sentence, back to this document. If it cannot, it does not exist.

**Status:** canonical. This document *supersets* `planning-spine-v0/00_NORTH_STAR.md` — it preserves
every v0 commitment and refusal below (§6) and adds the consolidation arc (§2), the first build (§3),
and the locked decisions (§4). It does not replace the governing doctrine consolidated in
`1.0_VISION/LifeOS Master Plan — Consolidated v1 (2026-07-07).md`; it points at it (§5).

Set: 2026-07-07. Home repo: `FlexNetOS/lifeos` (`lifeos/`). Owner & final authority: **David**.

---

## 1. The North Star (verbatim, unchanged)

> "LifeOS is the living company, personal, development, and home operating environment. It is not
> the CEO. LifeOS is the environment, runtime spine, memory substrate, policy layer, and execution
> surface."

- **NOA** = the CEO agent (product/personality). **CECCA** = the internal CEO-agent role/class NOA
  implements. Neither outranks David.
- **Primary objective:** convert human intent into a **governed, simulated, executable, verified
  task graph** — `intent → authority graph → task graph → simulation → hermetic cell → proof ledger
  → next-action recommendation`.
- **Runtime rule:** no agent gets unlimited authority; every meaningful action passes through
  identity → policy → memory → simulation → execution → proof → rollback.

## 2. The consolidation target (the "single LifeOS app")

Everything in this user space converges into **one grown-up, consolidated, physically-merged,
Rust-native LifeOS application**.

- **Grown up, not greenfield.** The app already exists in embryo as `lifeos/lifeos/` (today Tauri 2 +
  Vue 3). It is grown into the everything-app. **The UI layer is not permanent (Vue may go); the
  substrate is always Rust-native.**
- **Physically merged.** The ~31 independent peer repos under `lifeos/src/` are consolidated into the
  single app over time — not merely orchestrated as separate repos. Consolidation is **superset /
  upgrade-only** (Law 2): no capability is dropped in a merge.
- **MVP1 domain:** financial + legal, for self-sustained growth. Stack target: **Rust + Lua** (Rust =
  compiled memory, vector math, safety gates, execution authority; Lua/mlua = policy script / behavior
  selector / routing DSL).
- **Foundation:** the Yazelix + Nix profile is the portable, confined foundation binary/runtime model
  everything adapts to (RULES §0; proven healthy on this host 2026-07-07).

## 3. The first build — the Task Execution Automation System (TEAS)

The substrate every vertical rides on is the governed task-graph engine. It is built **first**, because
without it the app is "a pretty cockpit for a car with no engine."

**TEAS unifies six task systems that already exist and already compile** — it is a *convergence, not a
rewrite*. Evidence (real builds, 2026-07-07): rusty-idd, handoff, meta, meta-ruvector task slice,
execution-framework, and prompt_hub all build green today; the systems are independently reaching for
the **same task contract** (`handoff.task.v1` originates in handoff and is already mirrored in
rusty-idd; prompt_hub's intent classifier is mirrored in handoff). TEAS formalizes that seam.

**The eight bounded contexts** (full model: `1.0_VISION/teas/DOMAIN_MODEL.md`):

| Context | Owner system | Responsibility |
|---|---|---|
| Intent / Front Door | prompt_hub | human intent → ExecutionPlan → emit WorkOrders |
| Selection / Knowledge | gitkb | deterministic `ready` scoring + dependency `plan` + CAS assign |
| Contract / Spec / Governance | rusty-idd | OpenSpec lifecycle, `next` oracle, IntentLock authoring |
| **Execution Kernel (CORE)** | handoff | WorkOrder aggregate, witnessed ledger, policy/gate + lease engine |
| Dispatch Substrate | meta | plugin protocol (planner→executor), `loop_lib`, worktrees |
| Runtime / Swarm Fabric | ruflo + rvAgent | agent spawn/topology; rvAgent = Rust-native `TaskRunner` |
| Learning / Memory | meta-ruvector (`sona`, `.rvf`/AgentDB) | trajectory capture, ReasoningBank, HNSW recall |
| Batch Pipeline | execution-framework | CSV → packet → proof three-surface batch mode |

## 4. Locked architecture decisions (owner-approved 2026-07-07)

1. **Canonical task aggregate = `handoff.task.v1`** (WorkOrder + 5-hash blake3 `IntentLock`). Every
   context produces/consumes this schema through anti-corruption adapters. One task schema, workspace-wide.
   The published schema is the *healed target*; the origin handoff struct converges to it, superset-only
   (`teas/DOMAIN_MODEL.md` §9.6).
2. **Reality plane = handoff's witnessed redb ledger** (append-only, blake3 witness chain, replay).
   The three divergent proof shapes (handoff ledger / execution-framework `proof_ledger.jsonl` /
   planning-spine `proof-record.schema.json`) unify into one versioned `proof_record` schema.
3. **Execution kernel = handoff.** It already carries the task aggregate, the ledger, the fail-closed
   policy/gate engine, the atomic lease engine, and an MCP surface — and it already path-deps the
   ruvector brain (`ruvector-verified`, `cognitum-gate-tilezero`, `rvf-*`).
4. **Build home = meta-ruvector.** The new Rust-native engine is a new member `crates/rvAgent/rvagent-engine`
   that **implements the existing `rvagent-a2a::TaskRunner` trait** and speaks `handoff.task.v1` — reusing
   `AgentGraph`, `Router`, `SubAgentOrchestrator`, `sona`, and `rvf`. **No parallel task type.**
5. **Governed, gated execution.** Automatic Needs-Human-Approval for: spend, legal, external real-world
   action, production mutation, account creation, credential handling, trading, physically-impactful home
   automation, anything irreversible. The CEO agent may propose/prioritize/delegate — it may not execute
   raw shell directly.

## 5. Governing doctrine (pointer, not a copy)

The six core laws, the Constitution, the authority graph, the RULES §0–§7 operating rules, and the
full provenance live in `1.0_VISION/LifeOS Master Plan — Consolidated v1 (2026-07-07).md`. They bind
all execution here. Do not re-derive them; anchor to them.

Local operating laws (harness-enforced) also bind every step: never delete / always archive; upgrade
only (superset merges); heal, do not harm; real execution only (proof, not paper); git topology
(develop + main long-lived only); containment (depth-1 agents, ≤6 active); stop means stop.

## 6. v0 / RFC / post-v0 boundary (preserved from 00_NORTH_STAR, extended)

| Layer | Status | Notes |
|---|---|---|
| Intent, authority, tasks, worldseed, hermetic cell, proof, next action | `v0` | Required for first implementation |
| **TEAS convergence (this document §3)** | **`v1` (active build)** | Concrete embodiment of the v0 slice at production scale |
| DevWorld ↔ Mirofish adapter | `RFC` | Specified, not implemented (RFC-001) |
| Compiled agent brainpack | `RFC` | Specified, not implemented (RFC-002) |
| Full Odysseus cockpit / Hermes substrate | `post-v0` | Deferred until the engine is proven |
| Full company hierarchy & agent ecology | `post-v0` | Deferred |
| Home automation ("Alexa on steroids") | `post-v0` | Deferred; rides TEAS once proven |

**What v0/v1 refuses to become (unchanged):** a full enterprise hierarchy model; a full Odysseus
stack; a full Hermes substrate; a Docker-first deployment story; a standalone Mirofish product; a
UI-led system instead of a runtime-led one.

## 7. Success definition

**v0 slice (preserved):** a single vertical slice accepts an `Intent`, derives an `Authority Graph`,
produces a constrained `Task Graph`, runs a `WorldSeed` through DevWorld, converts simulation output
into task constraints, executes a task inside a hermetic `Cell`, writes `ProofRecord` entries, and
emits the next `Decision`/`Action`.

**v1 / TEAS proof (new):** one `handoff.task.v1` WorkOrder flows **end-to-end through the unified
system** — `prompt_hub` intent → `gitkb ready` selection → `handoff claim` (lease) → `rvagent-engine`
run → **witnessed proof on the handoff ledger** → next-action — with every gate enforced and no paper
completion. When that single WorkOrder is provable end-to-end, the engine is real.

## 8. Anti-drift protocol

- Every task links to exactly one line of §2–§4 above (its anchor).
- Think small / act small: the first slice is **one** WorkOrder end-to-end (§7), not the whole fabric.
- Proof closes reality: "done" requires an observed command and a witnessed proof record — never a
  document, never an assertion.
- Surface contradictions (Law 3); never resolve them silently. Open contradictions to heal are tracked
  in `1.0_VISION/teas/DOMAIN_MODEL.md` §Contradictions.
