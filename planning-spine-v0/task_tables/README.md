---
id: lifeos.planning-spine.task-tables.nu-plugin-handoff
title: nu_plugin Execution Task Tables
description: Lossless, review-only LifeOS handoff of every CSV record in the nu_plugin execution package, with WorkOrders, packets, dispatch/approval/lease control, append-only ledgers, recovery plans, receipts, and BLAKE3 IntentLocks.
type: task-table-execution-handoff
schema: lifeos.task-table-handoff.v1
item_schema: handoff.task.v1
collection_schema: handoff.task.v1.collection
status: active-review
lifecycle: maintained
created: 2026-07-13
updated: 2026-07-13
source_repository: src/nu_plugin
source_commit: c84740532ded2a27ee283ea7a3a5f303eaeb61a7
source_files: 8
source_records: 428
work_orders: 106
mandatory_capabilities: 28
mandatory_language_sources: 87
mandatory_language_occurrences: 295
unclassified_normative_occurrences: 0
reference_superset: planning-spine-v0/envctl-db-nu-plugin-migration-automation-package
local_status: review
aliases:
  - CodeDB task-table handoff
  - nu_plugin execution import
  - CDB WorkOrders
tags:
  - lifeos
  - planning-spine
  - task-table
  - nu-plugin
  - codedb
  - provenance
  - intent-lock
  - agent-handoff
related:
  - "[[planning-spine-v0/README]]"
  - "[[planning-spine-v0/navigation/README]]"
  - "[[planning-spine-v0/03_TASK_GRAPH_SCHEMA]]"
  - "[[planning-spine-v0/06_PROOF_LEDGER]]"
  - "[[planning-spine-v0/08_EXECUTION_GATES]]"
  - "[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]"
  - "[[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]]"
  - "[[planning-spine-v0/task_tables/workflow/mandatory_language_inventory]]"
---

# nu_plugin Execution Task Tables

This directory is the explicit task-table landing zone for the eight CSVs in
`src/nu_plugin/execution` at commit
`c84740532ded2a27ee283ea7a3a5f303eaeb61a7`. It preserves the source bytes,
accounts for every record, and translates only the 106 graph rows into
`handoff.task.v1` WorkOrders. The import is a deterministic planning handoff;
it does not execute commands, mutate `src/nu_plugin`, or manufacture proof.

`handoff.task.v1` is exactly one review-only WorkOrder envelope.
`handoff.task.v1.collection` is only the deterministic wrapper around the 106
review envelopes in this import. Neither schema is the workflow superset.
The full moved package is the reference superset; this directory is its LifeOS
control-plane companion for the separate `nu-plugin-cdb-handoff` namespace.

> [!IMPORTANT]
> Upstream `complete` is not LifeOS completion. Each upstream value is retained
> in `source_status`; every LifeOS WorkOrder starts at `status: review`, requires
> a new proof, has `proof_uri: null`, and requires human approval before any
> execution workflow may advance it.

## Agent quick route

| Need | Start here | Machine form |
|---|---|---|
| Verify source identity and counts | [Source manifest](./source_manifest.json) | `source_manifest.json` |
| Read canonical task intent | [WorkOrders](./canonical/work_orders.json) | `handoff.task.v1.collection` |
| Traverse normalized dependencies | [Normalized graph](./canonical/task_graph.normalized.json) | 106 nodes and typed edges |
| Resolve packet identity/digests | [Execution manifest](./manifests/execution_manifest.json) | 106 packet receipts |
| Inspect a bounded task packet | [`TASK-CDB000`](./packets/TASK-CDB000.json) | `lifeos.execution-packet.v1` |
| Scan tasks in a spreadsheet | [WorkOrder projection](./projections/work_orders.csv) | CSV, 106 records |
| Inspect read/write/validation scope | [Companion gates](./normalized/companion_gates.json) | one gate per WorkOrder |
| Inspect requirement evidence | [Requirements](./normalized/requirements.json) | 140 non-executable records |
| Inspect historical commands | [Command history](./normalized/commands.json) | 76 non-executable records |
| Trace any imported row | [Source-row index](./normalized/source_row_index.json) | 428 unique row keys |
| Inspect dependency/approval dispatch | [Dispatch plan](./control/dispatch_plan.json) | initial dispatch count is zero |
| Review actual-human gates | [Approval queue](./control/approval_queue.json) | 106 pending decisions |
| Inspect atomic lease slots | [Lease registry](./control/lease_registry.json) | 106 available slots |
| Verify append-only history | [Ledger manifest](./ledgers/ledger_manifest.json) | hash-chained events; zero task proofs |
| Inspect recovery prerequisites | [Checkpoints](./recovery/checkpoint_catalog.json), [replay](./recovery/replay_plan.json), [rollback](./recovery/rollback_plan.json) | 106 guarded plans each |
| Review mandatory migration coverage | [Capability catalog](./workflow/mandatory_capabilities.json), [CSV projection](./workflow/mandatory_capabilities.csv) | exactly 28 mandatory, review-only capabilities |
| Reverse-audit normative language | [Language inventory](./workflow/mandatory_language_inventory.json), [CSV projection](./workflow/mandatory_language_inventory.csv) | every `optional`/`should`/`may`/`must` occurrence classified; zero unclassified |
| Render execution state | [Mermaid](./visuals/task_graph.mmd), [DOT](./visuals/task_graph.dot), [TUI](./visuals/dashboard.txt), [event stream](./visuals/event_stream.ndjson), [HTML](./visuals/task_graph.html), [wiki](./visuals/task_graph.wiki.md) | deterministic canonical projections |
| Audit reference-package bytes and claims | [Reference package audit](./workflow/reference_package_audit.json) | exact manifest plus fail-closed semantic isolation |
| Verify artifact digests | [Artifact manifest](./receipts/artifact_manifest.json) | includes the external reconciliation projection |
| Verify all mandatory surfaces | [Completeness receipt](./receipts/completeness_report.json) | review handoff only, never task completion |
| Review join coverage | [Reconciliation](../generated/task_table_reconciliation.csv) | 106 task joins |
| Check all invariants | [Validation report](./validation_report.json) | deterministic pass/fail receipt |
| Understand architecture claims | [Blueprint Compatibility](../1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) | maintained correction layer |

Wiki routes: [[planning-spine-v0/navigation/README]] ·
[[planning-spine-v0/03_TASK_GRAPH_SCHEMA]] ·
[[planning-spine-v0/06_PROOF_LEDGER]] ·
[[planning-spine-v0/08_EXECUTION_GATES]] ·
[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]] ·
[[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]]

## Truth and authority order

1. Current checked source, executable tests, and explicit user decisions.
2. LifeOS canonical planning contracts and accepted, append-only proof records.
3. This import's pinned raw bytes, source manifest, and deterministic
   reconciliation. These prove what the upstream CSVs said, not that the work
   is complete in LifeOS.
4. Maintained claim normalization and
   [Blueprint Compatibility](../1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md).
5. The raw
   [Architecture Blueprint](<../1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md>)
   as unverified architecture input.
6. Human CSV projections and navigation indexes, which are derived views only.

The exact source CSVs under [`raw/`](./raw/) are immutable snapshots. JSON in
`canonical/` and `normalized/` is the machine-readable handoff. CSV under
`projections/` and the generated reconciliation are human-readable views; they
must never outrank canonical JSON or source bytes.

## Record taxonomy

| Taxonomy | Source files | Records | Treatment |
|---|---:|---:|---|
| Task graph | `TASK_GRAPH`, `BIDIRECTIONAL_TASK_GRAPH`, `POLYGLOT_TASK_GRAPH` | 106 | Canonical review-only WorkOrders `TASK-CDB000` through `TASK-CDB105` |
| Companion scope | three matching `*_TASK_FILE_MAP` tables | 106 | Separate one-to-one `GATE-CDBnnn` joins; not embedded into intent |
| Requirements | `REQUIREMENT_PROOF_LEDGER` | 140 | Non-executable evidence/provenance records |
| Commands | `COMMAND_LEDGER` | 76 | Non-executable historical records; original cwd is provenance only |
| **Total** | **8 CSVs** | **428** | Every row has one unique source-row-index entry |

Sixty-five requirement rows and sixty command rows correlate to CDB000–105.
The remaining 75 requirements and 16 commands are intentionally retained
without a WorkOrder link because their identifiers describe other upstream
evidence/history. Inventing a join would corrupt provenance.

## WorkOrder policy

Every WorkOrder enforces the migration workflow boundary derived from the
envctl execution-framework design:

- `status: review` is local truth; `source_status` is upstream provenance;
- dependency and block edges are mapped to `TASK-CDBnnn` IDs and validated for
  unknown nodes and cycles;
- repository and executable filesystem fields are rooted at `src/nu_plugin`;
- network access, dependency installation, and dependency changes are denied;
- `proof_required` and human approval are mandatory while `proof_uri` remains
  `null`;
- file-map scope and validation gates remain separate companion records;
- rollback removes only the imported LifeOS handoff and regenerates it from the
  pinned snapshot; it never mutates upstream source; and
- an actual BLAKE3-256 IntentLock binds canonical sorted-key JSON for the task
  intent and policy. The validator recomputes all 106 locks.

The item schema is [handoff.task.v1.schema.json](./handoff.task.v1.schema.json):
one file-constrained, review-only WorkOrder envelope. The
`handoff.task.v1.collection` record carries 106 envelopes but grants no
collection-level execution or completion authority.
Historical command text and source cwd values are preserved only in records
with `executable: false`; executable WorkOrder path fields contain no historical
absolute cwd.

## Mandatory LifeOS control-plane companion

The full moved
[[planning-spine-v0/envctl-db-nu-plugin-migration-automation-package/README]]
is the reference superset and remains workflow/design input, not completion
authority. The following formerly "optional" execution surfaces are mandatory
in this safe, review-only LifeOS control-plane companion:

1. `canonical/task_graph.normalized.json` preserves the dependency and block
   graph independently from the canonical WorkOrder collection.
2. `manifests/execution_manifest.json` binds every task to one schema-validated,
   SHA-256-receipted packet under `packets/`.
3. `control/dispatch_plan.json` computes dependency readiness from LifeOS-local
   status only. The initial plan dispatches zero tasks.
4. `control/approval_queue.json` requires an actual human decision bound to the
   task's current BLAKE3 IntentLock. All 106 decisions start pending.
5. `control/lease_registry.json` defines 106 task scopes. The importer exports
   `acquireTaskLease()` and `releaseTaskLease()`, implemented with exclusive
   filesystem creation and token-checked release.
6. `ledgers/events.jsonl` is a SHA-256 hash-chained append-only import history.
   `ledgers/proofs.jsonl` is deliberately empty: no upstream status/evidence is
   copied into LifeOS task proof. Runtime append functions reject evidence-free
   passed proofs.
7. `recovery/` requires pre-execution checkpoints, dry-run-only replay planning,
   and unarmed, approval-gated rollback for every task.
8. `receipts/artifact_manifest.json` binds deterministic handoff artifacts;
   `receipts/completeness_report.json` verifies surface coverage while reporting
   zero execution proofs, zero promoted tasks, and `execution_status:
   not_started`.
9. `visuals/` materializes every richer visual that the reference prompt once
   called optional: Mermaid, Graphviz DOT, an ANSI-free TUI dashboard, an NDJSON
   live-event stream/replay surface, static HTML, and a wiki-linked Markdown
   table. Every view derives from canonical task, dispatch, approval, lease,
   event, and recovery records; no view has independent status authority.
10. `workflow/mandatory_capabilities.json` preserves the audited
    `CAP-MIG-001`–`CAP-MIG-028` requirements as a versioned companion catalog;
    its CSV sibling is a deterministic projection. Every entry is
    `requirement: mandatory`, `local_status: review`, and
    `product_complete: false`.
11. `workflow/mandatory_language_inventory.json` reverse-scans scoped normative
    reference-package sources plus all eight pinned task-table CSVs. Its CSV
    sibling classifies every `optional`, `should`, `may`, and `must` occurrence
    as mandatory capability, compatibility/state semantics, or non-normative
    evidence; any unclassified normative occurrence fails generation.

## Mandatory capability companion catalog

The [JSON catalog](./workflow/mandatory_capabilities.json) is authoritative for
the 28 semantic capabilities extracted from the moved reference package and
pinned task tables. Each
record carries exact source path, line range, and wording; the mandatory
requirement; its verification gate; mapped `TASK-CDBnnn` coverage; planning
evidence; and an explicit coverage boundary. The
[CSV projection](./workflow/mandatory_capabilities.csv) preserves the same 28
IDs for fast agent scanning.

Catalog coverage is not a product-completion claim. In particular,
`CAP-MIG-007` records the missing operation-level lease model while retaining
the handoff's implemented task-lease primitive; `CAP-MIG-009` distinguishes
the six planning visuals from runtime product wiring; `CAP-MIG-012`
distinguishes this handoff event chain from envctl runtime tamper coverage; and
`CAP-MIG-023` keeps checkout-bound issue/PR integration as explicit review
work; `CAP-MIG-027` makes the issue-414 polling fallback and inotify resilience
mandatory without promoting reference status; and `CAP-MIG-028` makes the
`TASK-CDB095` Tier-4 boundary mandatory review scope. `CAP-MIG-009` also binds
the unmatched `REQ-061-ARCH11` TUI requirement as mandatory provenance.

The [reference namespace registry](./workflow/reference_namespaces.json) keeps
three graphs distinct: `reference-framework` (80 tasks),
`reference-issue-414` (12 tasks), and `nu-plugin-cdb-handoff` (106 WorkOrders).
Reference task IDs, statuses, packets, and proofs are never collapsed into the
CDB handoff namespace.

The hard [reference package audit](./workflow/reference_package_audit.json)
recomputes every file listed by the package's self-excluding
`PACKAGE_MANIFEST.json`. Missing/unlisted files, count drift, duplicate paths,
or byte/hash drift fail both `--write` and `--check`. The package-local
validator now enforces the same manifest closure, while this independent
LifeOS receipt additionally enforces namespace and completion-claim isolation;
neither check substitutes for the other.

The same audit also records the package's contradictory semantic layers
without repairing or trusting them: the 80-row graph contains 76 `pending` and
4 `complete` source rows, while proof-derived state contains 78 `completed`
and 2 `passed` tasks. It separately receipts 80 packets, 88 proof files, 88
distinct merged proofs, 92 proof-ledger rows, eight human-required tasks, and
eight agent approvals. All reference statuses, proofs, and agent approvals are
classified `review_evidence_only`; `pass_no_gaps` and
`local_package_complete` claims are explicitly rejected. The audit therefore
sets `admissible_as_lifeos_completion: false` and verifies that zero reference
statuses or proofs enter the LifeOS completion boundary.

## Blueprint cross-reference

The import follows the Blueprint's useful direction without treating its prose
as implementation proof:

| Blueprint direction | Handoff implementation | Boundary |
|---|---|---|
| Deterministic provenance and historical roots | pinned commit, exact SHA-256 receipts, unique source-row keys, BLAKE3 IntentLocks | Proves import identity only; it does not prove RuVector witness-chain enforcement |
| Dependency-graph integrity | validated `depends_on`/`blocks`, unknown-edge and cycle gates | Does not claim GNN or MinCut implementation |
| Isolated branches and deterministic rollback | review-only records, denied mutation policy, task-local rollback text | Does not claim database-native COW branching |
| envctl materialization workflow | explicit canonical JSON, projections, validation report, and proof boundary | Does not claim an operational PostgreSQL projection engine |
| Proof-gated swarm work | `proof_required: true`, `proof_uri: null`, human approval required | Does not promote upstream evidence or status to LifeOS proof |

Read
[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]] before
using any imported task to interpret
[[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]].

## Deterministic operations

From the LifeOS repository root, use the profile-owned Bun runtime:

```bash
# Validate committed raw snapshots and every derived artifact.
bun planning-spine-v0/scripts/import-nu-plugin-task-tables.mjs --check

# Also prove the live sibling source still matches the pinned snapshots.
bun planning-spine-v0/scripts/import-nu-plugin-task-tables.mjs --check \
  --source-root ../nu_plugin/execution \
  --reference-package-root planning-spine-v0/envctl-db-nu-plugin-migration-automation-package

# Regenerate from the external source after intentionally reviewing its bytes.
bun planning-spine-v0/scripts/import-nu-plugin-task-tables.mjs --write \
  --source-root ../nu_plugin/execution \
  --reference-package-root planning-spine-v0/envctl-db-nu-plugin-migration-automation-package

# Focused contract tests.
bunx --no-install --bun vitest run tests/planning-spine-task-tables.spec.js
```

`--write` defaults to the sibling external `../nu_plugin/execution` directory.
`--check` defaults to the committed `raw/` snapshots so a clean checkout is
self-verifying. Supplying `--source-root` during `--check` adds a live byte-for-
byte drift comparison. Both modes hard-audit the moved reference package; an
explicit `--reference-package-root` is available for worktrees. The script
exports `checkTaskTableArtifacts()` for the planning-spine verifier, so
verification does not need a subprocess.

## Validation contract

The deterministic report must remain `passed` with zero:

- source-hash drift;
- missing or duplicate source rows;
- unknown dependency/block references;
- dependency cycles;
- IntentLock mismatches;
- Ajv 2020 WorkOrder schema errors;
- semantic execution-policy or workspace-root errors;
- graph/scope/task-ID mapping errors;
- packet schema, manifest, or digest errors;
- dependency/approval dispatch leakage;
- approval or lease coverage gaps;
- append-only event-chain errors;
- checkpoint, replay, or rollback coverage gaps;
- missing execution-framework surfaces; and
- reference-package manifest count, path, byte, or hash drift;
- reference completion-claim isolation failures;
- missing, duplicate, optional, promoted, source-drifted, or unmapped mandatory
  capabilities; and
- Mermaid/DOT node loss, TUI dispatch leakage, event-stream loss, or
  HTML/wiki row loss.

The record totals must remain exactly `428 = 106 graph + 106 scope + 140
requirements + 76 commands`, and reconciliation must remain exactly 106 data
rows. Any source change requires a deliberate source-commit review and updated
hash receipts; silent drift is a hard failure.
