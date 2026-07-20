---
id: lifeos.planning-spine.v0.navigation-hub
title: LifeOS Planning Spine Agent Navigation
description: Human-readable start page for deterministic topic, task, claim, evidence, proof, and file recall across planning-spine-v0.
type: navigation-index
status: active
lifecycle: maintained
created: 2026-07-12
updated: 2026-07-20
aliases:
  - Planning spine navigation
  - Agent recall index
  - Planning graph memory
tags:
  - lifeos
  - planning-spine
  - navigation
  - agent-memory
related:
  - "[[planning-spine-v0/README]]"
  - "[[planning-spine-v0/1.0_VISION/README]]"
  - "[[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE]]"
  - "[[planning-spine-v0/task_tables/README]]"
  - "[[planning-spine-v0/navigation/generated/navigation_index.json]]"
---

# LifeOS Planning Spine Agent Navigation

Start here when an agent needs planning context without already knowing a
filename. The [compact recall index](./generated/navigation_index.json) maps
paths, aliases, tags, topics, task IDs, claim IDs, and source IDs. The
[full graph](./generated/navigation_graph.json) preserves typed nodes, edges,
and backlinks used by the explain command. Both are deterministic projections of
[`source.json`](./source.json), canonical planning
inputs, proof history, and explicit document links.

Raw NotebookLM exports remain architecture inputs. Generated navigation makes
them easier to find; it does not promote them to decisions or implementation
proof. Follow [Blueprint Compatibility](../1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md)
before acting on a blueprint claim.

The two owner-named expanded anchors are preserved as immutable exact-byte
architecture inputs under [Architecture Anchors](../1.0_VISION/Architecture_Anchors/README.md).
Their [conflict ledger](../1.0_VISION/Architecture_Anchors/anchor_conflict_ledger.csv)
and [claim/task crosswalk](../1.0_VISION/Architecture_Anchors/anchor_claim_task_crosswalk.csv)
control interpretation. The [consolidation record](../consolidation/README.md)
proves the legacy `.handoff` and pre-reset proof shadow are no longer active
planning surfaces.

## Instant recall

Use the profile-owned Bun runtime:

```bash
bun run planning-spine:navigation:query -- "STORE-001"
bun run planning-spine:navigation:query -- "redb PostgreSQL authority"
bun run planning-spine:navigation:query -- "TASK-CDB030"
bun run planning-spine:navigation:query -- "CAP-MIG-001"
bun run planning-spine:navigation:explain -- "claim:REDB-CLAIM-002"
bun run planning-spine:navigation:check
```

Add `--json` after the script arguments for structured output. Search returns
stable node IDs; explain returns the selected node plus incoming and outgoing
typed edges.

## Authority route

| Need | Read first | Graph link |
|---|---|---|
| Repository operating contract | [Root AGENTS](../../AGENTS.md) | [[./AGENTS]] |
| Planning package boundary | [Planning Spine README](../README.md) | [[planning-spine-v0/README]] |
| Desired architecture and current truth order | [Vision Index](../1.0_VISION/README.md) | [[planning-spine-v0/1.0_VISION/README]] |
| Immutable expanded architecture anchors | [Architecture Anchors](../1.0_VISION/Architecture_Anchors/README.md) | [[planning-spine-v0/1.0_VISION/Architecture_Anchors/README]] |
| Legacy handoff disposition and archive | [Consolidation record](../consolidation/README.md) | [[planning-spine-v0/consolidation/README]] |
| Raw blueprint corrections | [Blueprint Compatibility](../1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) | [[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]] |
| Current work state | [Execution Status](../EXECUTION_STATUS.md) | [[planning-spine-v0/EXECUTION_STATUS]] |
| Canonical tasks | [Task source](../generated/task_graph.source.csv) and [task index](../generated/task_graph.index.json) | — |
| Review-only migration work | [Landing contract](../ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md) and [task-table handoff](../task_tables/README.md) | [[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE]] · [[planning-spine-v0/task_tables/README]] |
| Accepted completion history | [Proof ledger](../proof_records/proof_ledger.jsonl) | — |
| Navigation integrity | [Validation report](./generated/navigation.validation_report.json) | — |

## Migration package and imported task tables

The [landing contract](../ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md) defines the
truth boundary for the copied
[envctl migration package](../envctl-db-nu-plugin-migration-automation-package/README.md).
Its [106 WorkOrders](../task_tables/projections/work_orders.csv) and
[28 mandatory capabilities](../task_tables/workflow/mandatory_capabilities.csv)
are review-only planning records. Upstream completion text and package proof do
not enter the canonical LifeOS task or proof namespaces.

| Namespace | Exact lookup | Authority boundary |
|---|---|---|
| Canonical LifeOS tasks | `by_task_id` | Exactly the rows in `generated/task_graph.source.csv`; the generator derives the count and proof-derived lifecycle. |
| Imported WorkOrders | `by_work_order_id` | `TASK-CDB000..105`; local status remains `review`, source status is provenance only. |
| Mandatory capabilities | `by_mandatory_capability_id` | `CAP-MIG-001..028`; mandatory review scope, never a completion claim. |

Wiki routes: [[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE]] ·
[[planning-spine-v0/task_tables/README]] ·
[[planning-spine-v0/envctl-db-nu-plugin-migration-automation-package/README]] ·
[[planning-spine-v0/task_tables/workflow/mandatory_capabilities]]

## Canonical planning contracts

These links give every canonical contract an explicit inbound route while
preserving its proof-bound bytes.

| Order | Contract | Wiki link |
|---:|---|---|
| 00 | [North Star](../00_NORTH_STAR.md) | [[planning-spine-v0/00_NORTH_STAR]] |
| 01 | [Object Model](../01_OBJECT_MODEL.md) | [[planning-spine-v0/01_OBJECT_MODEL]] |
| 02 | [Authority Graph](../02_AUTHORITY_GRAPH.md) | [[planning-spine-v0/02_AUTHORITY_GRAPH]] |
| 03 | [Task Graph Schema](../03_TASK_GRAPH_SCHEMA.md) | [[planning-spine-v0/03_TASK_GRAPH_SCHEMA]] |
| 04 | [WorldSeed Schema](../04_WORLDSEED_SCHEMA.md) | [[planning-spine-v0/04_WORLDSEED_SCHEMA]] |
| 05 | [Hermetic Cell Contract](../05_HERMETIC_CELL_CONTRACT.md) | [[planning-spine-v0/05_HERMETIC_CELL_CONTRACT]] |
| 06 | [Proof Ledger](../06_PROOF_LEDGER.md) | [[planning-spine-v0/06_PROOF_LEDGER]] |
| 07 | [MVP Vertical Slice](../07_MVP_VERTICAL_SLICE.md) | [[planning-spine-v0/07_MVP_VERTICAL_SLICE]] |
| 08 | [Execution Gates](../08_EXECUTION_GATES.md) | [[planning-spine-v0/08_EXECUTION_GATES]] |
| 09 | [Open Questions](../09_OPEN_QUESTIONS.md) | [[planning-spine-v0/09_OPEN_QUESTIONS]] |

## Vision and architecture

| Resource | Authority boundary | Wiki link |
|---|---|---|
| [Vision Index](../1.0_VISION/README.md) | Maintained navigation and truth ordering | [[planning-spine-v0/1.0_VISION/README]] |
| [Expanded Architecture Anchors](../1.0_VISION/Architecture_Anchors/README.md) | Exact-byte target topology inputs plus controlling conflict/task crosswalks | [[planning-spine-v0/1.0_VISION/Architecture_Anchors/README]] |
| [Legacy Consolidation](../consolidation/README.md) | Complete handoff/shadow disposition and recoverable archive receipt | [[planning-spine-v0/consolidation/README]] |
| [Vision North Star](../1.0_VISION/NORTH_STAR.md) | Desired architecture input | [[planning-spine-v0/1.0_VISION/NORTH_STAR]] |
| [Master Plan](<../1.0_VISION/LifeOS Master Plan — Consolidated v1 (2026-07-07).md>) | Consolidated vision input | [[planning-spine-v0/1.0_VISION/LifeOS Master Plan — Consolidated v1 (2026-07-07)]] |
| [Project Artifacts](<../1.0_VISION/VISION - Project Artifacts.md>) | Vision artifact inventory | [[planning-spine-v0/1.0_VISION/VISION - Project Artifacts]] |
| [Original planning-spine brief](<../1.0_VISION/lifeos-planning-spine v0.md>) | Preserved architecture input | [[planning-spine-v0/1.0_VISION/lifeos-planning-spine v0]] |
| [Ecosystem Map](../1.0_VISION/FOUNDATION_ECOSYSTEM_MAP.md) | Maintained built/planned interpretation | [[planning-spine-v0/1.0_VISION/FOUNDATION_ECOSYSTEM_MAP]] |
| [Portability Model](../1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL.md) | Maintained portability interpretation | [[planning-spine-v0/1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL]] |
| [NotebookLM Catalog](../1.0_VISION/Notebooklm/README.md) | Exact-byte, unverified raw-input catalog | [[planning-spine-v0/1.0_VISION/Notebooklm/README]] |

## Authority, operations, RFCs, and simulation

| Group | Resources |
|---|---|
| Durable-state authority | [PGAUTH-001](../docs/authority/PGAUTH-001-durable-state-contract.md) · [[planning-spine-v0/docs/authority/PGAUTH-001-durable-state-contract]] · [PGAUTH-003](../docs/authority/PGAUTH-003-cognition-state-contract.md) · [[planning-spine-v0/docs/authority/PGAUTH-003-cognition-state-contract]] · [PGAUTH-004](../docs/authority/PGAUTH-004-projection-state-contract.md) · [[planning-spine-v0/docs/authority/PGAUTH-004-projection-state-contract]] · [PGAUTH-005](../docs/authority/PGAUTH-005-external-state-contract.md) · [[planning-spine-v0/docs/authority/PGAUTH-005-external-state-contract]] |
| Source protocol | [NotebookLM Source Extraction](../docs/NOTEBOOKLM_SOURCE_EXTRACTION_PROTOCOL.md) |
| Operations | [Heartbeat Notes](../docs/heartbeat_notes.md) · [Meta Authority Ownership](../docs/meta-authority-ownership.md) |
| Current-state views | [System Inventory](../1.0_VISION/current_state/SYSTEM_INVENTORY.md) · [Build Matrix](../1.0_VISION/current_state/BUILD_MATRIX.md) · [Dependency Graph](../1.0_VISION/current_state/DEPENDENCY_GRAPH.md) · [Convergence](../1.0_VISION/current_state/CONVERGENCE.md) |
| Navigation research | [GitKB Documentation Extraction](<../1.0_VISION/current_state/tools/runbook-to-exec-cockpit/GitKB Documentation Extraction and AI Navigation.md>) · [Runbook Compiler / Execution Cockpit](<../1.0_VISION/current_state/tools/runbook-to-exec-cockpit/Runbook Compiler_Execution Cockpit.md>) |
| TEAS | [Domain Model](../1.0_VISION/teas/DOMAIN_MODEL.md) · [Build Task Graph CSV](../1.0_VISION/teas/BUILD_TASK_GRAPH.csv) |
| Simulation | [WorldSim](../worldsim/README.md) · [[planning-spine-v0/worldsim/README]] |
| Proposals | [Mirofish Adapter RFC](../rfcs/RFC-001_DEVWORLD_MIROFISH_ADAPTER.md) · [[planning-spine-v0/rfcs/RFC-001_DEVWORLD_MIROFISH_ADAPTER]] · [Compiled Brainpack RFC](../rfcs/RFC-002_COMPILED_AGENT_BRAINPACK.md) · [[planning-spine-v0/rfcs/RFC-002_COMPILED_AGENT_BRAINPACK]] |
| Derived operational views | [Current State Map](../state/current_state_map.md) · [Capability Priority](../capability_state/p0_priority_report.md) · [Connector State](../connector_state/connector_current_state.md) · [Weave Bus Evaluation](../weave_state/weave_bus_evaluation.md) |

## Machine graph contract

The authored [navigation source](./source.json) defines semantic
routes, authority and lifecycle vocabulary, strict-link documents, exclusions,
and structured-source adapters. The Bun generator discovers all other files,
so new resources cannot disappear merely because a hand-maintained inventory
was not updated.

The generated graph contains:

- a rich metadata node for every included planning-spine file;
- directory containment, Markdown links, wiki links, and backlinks;
- canonical task nodes and parent relationships;
- NotebookLM source, claim, verification-queue, and evidence nodes;
- accepted proof-ledger revisions, including explicitly typed historical tasks;
- structured North Star anchors, architecture depths, gaps, conflicts, and
  adopted capabilities;
- isolated imported WorkOrder and mandatory-capability nodes with exact lookup
  maps and no canonical task/proof promotion; and
- curated topic routes that connect architecture language to exact task,
  source, claim, evidence, proof, and file nodes.

The generator intentionally excludes its own three outputs from the input
inventory to avoid self-referential hashes. Timestamped verifier reports remain
nodes but are marked volatile and carry no content digest. Cache files, compiled
Python, and process IDs are not planning resources.

The complete navigation surface lives under `planning-spine-v0/navigation/`
and is intentionally outside the proof-bound LPS-018 execution-bundle payload.
That keeps repository-wide discovery separate from the bundle's narrower,
manifested execution handoff without changing its proof-pinned packager.

## External index boundary

GitNexus and GitKB are non-authoritative accelerators. The 2026-07-12 audit found
that GitNexus resolved a stale parent-Meta index; GitKB's worktree-local code
view reported zero files and symbols while its aggregate doctor reported two
symbols across 111 files and no configured repositories. These receipts prove
that neither cache can be treated as LifeOS planning authority without first
verifying repository and worktree identity. The committed graph and index are
generated with Bun and do not depend on either service. Links into sibling
repositories are represented as path-only external references, so their mutable
bytes cannot affect graph identity or fresh-clone validation.
