# Blueprint task cross-check — conflicts, extensions, gaps

Date: 2026-07-23 · Author: Fable 5 (staging for Codex)
Scope: 19 new component tasks + 1 epic (meta-root KB, `tasks/blueprint-*`) cross-analyzed
against the 207 existing meta-root KB tasks (`reports/existing-tasks-baseline.tsv`, all
status `completed`) and the 8 lifeos-local KB tasks.

Operating constraint applied throughout (owner directive): completed planning-spine tasks
and green test suites are **untrusted claims until independently audited**. A completed
task that claims scope the blueprint's review ledger says is unbuilt is recorded as a
CONFLICT with a verify-first resolution, never silently deduplicated away.

## Table 1 — Conflicts (claimed-complete vs blueprint-open) — all resolved

| # | Existing task (status) | Blueprint evidence | Resolution (encoded in the new task) |
|---|---|---|---|
| C1 | `tasks/architecture-rtk-nu-adapter` (completed) | R07 said rtk_nu existed nowhere on 2026-07-19; R18 addendum records an implementation (`rtk-tokenkill src/rtk_nu_main.rs`, envelope `flexnetos.rtk_nu.envelope.v1`) but operational invariant 16 keeps the gate un-narrowed until revision/schema/closure/witness are pinned | RESOLVED: `tasks/blueprint-rtk-rtk-nu-envelope` leads with an independent audit of the claimed implementation; INV16 pin gate is an explicit acceptance criterion |
| C2 | `tasks/yzx-iso/t8-6-frontdoor-wiring` (completed, "Wire Glass/Engine Room front door") | R02: "No LifeOS PTY exists"; R01/R19: Vue→Svelte still OPEN (package.json `"vue": "^3.5.34"` on 2026-07-23) | RESOLVED: `tasks/blueprint-glass-engine-frontdoor` and `tasks/blueprint-glass-svelte-migration` treat the front door as unbuilt until the R02/R03 test suites pass; the completed claim is audited, not inherited |
| C3 | `tasks/yzx-iso/t4-1-postgres-datadir`, `t4-2-ruvector-ext` (completed) | Blueprint keeps PG 17.10 + extension verification as install steps 3–4 with named checks | RESOLVED: `tasks/blueprint-postgres-ruvector-store` re-verifies (`SELECT extversion FROM pg_extension WHERE extname='ruvector'`, EXPLAIN `<=>` uses hnsw) before building on the claim |
| C4 | `tasks/yzx-iso/t4-3-redb-plane` (completed, "Wire redb transient shared plane") | R05: the owner/mmap projection publisher did not exist; redb 4.1 removed mmap | RESOLVED: `tasks/blueprint-redb-state-plane` audits what actually exists; owner service + atomic mmap publisher remain acceptance criteria |
| C5 | `tasks/yzx-iso/t4-4-envctl-committer`, `t4-6-secret-plane` (completed) | R11: drain/embed/commit worker absent at envctl rev 48368a97; R19: envctl now on branch `codex/profile-xdg-owner`, pins stale | RESOLVED: `tasks/blueprint-envctl-committer-security` re-audits the live checkout first; the worker loop and six secret subsystems remain acceptance criteria |
| C6 | `tasks/yzx-iso/t4-7-byte-complete` (completed, "Verify byte-complete ingress") | R09/R17: `codedb ingest-envelope` implemented at nu_plugin @931d48f but gate not narrowed; R19 flags R08 (Nu-parse-before-plugin) unverified against that revision | RESOLVED: `tasks/blueprint-codedb-ingress` re-runs the parity + envelope fixtures against @931d48f before accepting the claim |
| C7 | `tasks/architecture-data-pipeline-blueprint` (completed, "Build and verify expanded blueprint") | The blueprint document itself is delivered; its Review ledger enumerates open implementation work (R01–R19) | RESOLVED: no scope collision — that task delivered the *document*; the new stream implements it. Epic links it as provenance |

No unresolved conflicts remain. (Gate: this file contains no unresolved markers.)

## Table 2 — Extensions / related (link, don't duplicate)

| # | Existing document | Relationship to new stream |
|---|---|---|
| E1 | `tasks/ruvector-package-reconciliation` (completed) | Prior cross-analysis of Codex packages into the blueprint (additive); its findings are folded into the blueprint's §20, which rows T-graph `RV§20` cover |
| E2 | `tasks/yzx-iso/t1-6-blueprint-anchor`, `t3-6-envctl-commit`, `t4-0-lane-index`, `t4-5-migrate-agent-state`, `t5-1-finalize-xdg`, `t7-3-reattach-mounts` (completed) | Same infrastructure territory at yzx-iso milestone granularity; new tasks reference them only through the verify-first constraint — no scope duplicated, all remaining blueprint obligations are new work |
| E3 | `decisions/lifeos-postgresql-ruvector-durable-storage-boundary` (adr, active) | Standing ADR consistent with `tasks/blueprint-postgres-ruvector-store`; the new task conforms to it, no change needed |
| E4 | lifeos-local KB `tasks/blueprint-ingest-{parser-009,storage-010,embedding-011,relations-012,verification-013,envctl-014}` (active) | Different decomposition axis: those stage the blueprint-content-ingestion pipeline (blueprint → ICM/DB records); the new meta-root stream stages the *architecture implementation*. Left untouched in their KB; the epic notes them as a sibling stream |
| E5 | lifeos-local KB `tasks/blueprint-ruvector-ingestion-002` ("Transform RUVECTOR blueprint into .kb task", active) | Fulfilled by this build (task graph + 20 meta-root KB documents). Recommend the owner (or Codex) close it citing `reports/blueprint-task-graph.tsv` and the meta-root `tasks/blueprint-*` stream as completion evidence; not closed here because it lives in another KB's active workspace |
| E6 | `consolidate-lifeos-handoff-into-planning-spine` (completed) | Historical planning-spine consolidation; under the untrusted-claims directive its outputs are not load-bearing for the new stream |

## Table 3 — Gap proof (blueprint → tasks, zero uncovered)

Reverse-direction check, machine-verified by `reports/audit-section-coverage.py` (exit 0):

- 52 real blueprint headings (code-fence pseudo-headings excluded) → all mapped to ≥1
  task-graph row or a declared descriptive/constraint mapping.
- 203 task-graph rows; 202 actionable; every actionable row carries a non-TBD verification.
- All R01–R16 review-ledger blockers appear as obligations (R01→glass-svelte-migration,
  R02–R04/R13→glass-engine-frontdoor, R05→redb-state-plane, R06–R07→rtk-rtk-nu-envelope,
  R08–R09→codedb-ingress, R10–R11→envctl-committer-security, R12→byte-capture-reconciliation,
  R14→nix-release-gate, R16→data-schema; R19 re-review→coordination-surfaces).
- All 19 operational invariants map to obligations (INV04, INV06–INV14, INV16–INV19 as
  dedicated rows; INV01–INV03, INV05, INV15 are restatements of §1–§4 rows already present —
  verified by the dedup key in `build-task-graph.py`).
- The 21 HARD EXECUTION RULES are constraints, not tasks: copied into every task's Context
  by reference, per the epic.

Gaps found: **0**.

## Dependency-ordering note

The component dependency graph is intentionally cyclic (redb↔envctl, schema↔witness, …) —
the blueprint's architecture is bidirectionally coupled. Execution order for Codex comes
from the blueprint's own RV§17 sequential authority gates, encoded as `execution order N`
in every task's Context. Order within the same number may run concurrently.

## Verify-pass addendum (2026-07-23)

Surface driven: git-kb board/show/graph/search as a cold-start consumer, plus probes
(bad slug → clean error; tag filter; search ranking). Upgrades applied and committed
(KB commit "Verify-pass upgrades: …"):

1. **Intra-stream duplicate found and fixed**: T005 (§3.1) and T056 (RV§2) restated the
   Vue→Svelte migration owned by T165 (R01). Consolidated into
   `tasks/blueprint-glass-svelte-migration`; front-door task keeps T152 (step-13 integration)
   with an explicit scope-split note. TSV component column re-synced; coverage audit re-run green.
2. **Pin-currency audit** (observed on this host, appended to 7 tasks):
   rtk 0.43.0 ✓; Nushell 0.113.1 ✓; nu_plugin HEAD = 931d48f ✓ (matches R17 pin — R19 checkout
   staleness resolved); rtk_nu_main.rs exists (R18 verified) BUT rtk-tokenkill sits on
   `feat/rtk-full-feature-config` @ 43b93ab, not pinned develop 44cf84e7; envctl live checkout is
   `codex/profile-xdg-owner-20260721` @ 38f8aba (not R11's 48368a97); `/srv/flexnetos/sources/
   RuVector/6a6c39e6*` absent (RV§15 precondition unmet); pg tools absent from ambient PATH
   (verify inside Nix closure); @ruvector/rvf live registry 0.3.0 vs installed 0.2.3 vs ADR-era 0.1.x.
3. **Native metadata added**: `component` set on all 20 docs; execution-order encoded as a
   `blocked_by` DAG following the RV§17 authority-gate groups (order 1→2→3→5→6→7→8→9→13,
   plus glass-engine-frontdoor ← glass-svelte-migration).
4. **Tag collision noted**: pre-existing completed task `tasks/rtk-codex-hooks-server-dashboard-icm`
   also carries tag `codex`; stream queries should filter by tag AND status, or slug prefix.
5. Epic acceptance criteria checked off with evidence; progress log added.
