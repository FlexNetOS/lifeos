---
id: lifeos.vision.architecture-anchors
title: Verified Architecture Anchor Catalog
description: Exact-byte owner-supplied PostgreSQL/RuVector execution blueprint and topology graph with source receipts, conflict handling, and canonical task coverage.
type: architecture-cross-reference
status: active
lifecycle: maintained
created: 2026-07-20
updated: 2026-07-20
aliases:
  - Architecture anchors
  - RuVector expanded blueprint
  - Anchored data pipeline graph
tags:
  - lifeos
  - architecture
  - postgresql
  - ruvector
  - provenance
related:
  - "[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]"
  - "[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_TASK_COVERAGE]]"
  - "[[planning-spine-v0/consolidation/README]]"
---

# Verified Architecture Anchor Catalog

These files are immutable desired-architecture inputs supplied by the owner.
They are preserved byte-for-byte inside the repository so a Downloads path is
not the only copy of the architecture source.

| ID | Repository artifact | SHA-256 | Bytes | Lines |
|---|---|---|---:|---:|
| `ARCHANCHOR-001` | [RuVector Fully Expanded Blueprint](./Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md) | `c54063110be8bebb07469cbc0f76fecab142cd636e98950a36a3ee02b766a62c` | 974321 | 6340 |
| `ARCHANCHOR-002` | [Anchored Pipeline Graph](./Architecture_Data_Pipeline_Graph_ANCHORED_VERIFIED.md) | `abd36f1c2bd9d62e4fdb522e5290d93d4e7017b1b478c13dbf0a5da939c5b663` | 34773 | 560 |

Machine receipts live in [receipts.json](./receipts.json). The
[section inventory](./section_inventory.json) assigns every source line to one
contiguous section with its own digest; it supplements rather than replaces the
full-file digest. The
[atomic requirement crosswalk](./anchor_atomic_requirement_crosswalk.json)
partitions all 6,340 lines into 1,646 contiguous units and assigns 1,194 stable,
exact-provenance requirement IDs, including all 548 component-integration rows.
Its [CSV projection](./anchor_atomic_requirement_crosswalk.csv) carries the same
requirement-to-implementation fields for tabular review. Optional and
alternative language remains mandatory unless a later owner record explicitly
approves a Tier-B session toggle.

Original immutable inputs were read from:

- `/home/flexnetos/Downloads/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED (1).md`
- `/home/flexnetos/Downloads/Architecture_Data_Pipeline_Graph_ANCHORED_VERIFIED.md`

Key receipt ranges (all other ranges remain available in the complete section
inventory):

| Anchor | Lines | Heading / responsibility |
|---|---:|---|
| `ARCHANCHOR-001` | 9–32 | Hard execution rules |
| `ARCHANCHOR-001` | 33–46 | Bootstrap versus operational phases |
| `ARCHANCHOR-001` | 47–61 | Host all-data and original-byte contract |
| `ARCHANCHOR-001` | 62–115 | Glass/Engine, exact physical pipelines, redb owner, `rtk_nu`, Nu/plugin, and streaming envelopes |
| `ARCHANCHOR-001` | 116–585 | Diagram atlas D01–D24 |
| `ARCHANCHOR-001` | 586–655 | Component and envctl security scopes |
| `ARCHANCHOR-001` | 656–1232 | Full RuVector/RuVNet, AgentDB/RVF, redb, and envctl component architecture |
| `ARCHANCHOR-001` | 1233–1363 | CodeDB byte-complete ingress plus Nix/build/release integration |
| `ARCHANCHOR-001` | 1364–5570 | Canonical schema, RLS, procedures, triggers, background work, backup, replication, and reconstruction |
| `ARCHANCHOR-001` | 5571–6319 | Install order, bidirectional graph, byte reconciliation, component registry, conformance, review, and release doctrine |
| `ARCHANCHOR-001` | 6320–6340 | Operational invariants and acceptance |
| `ARCHANCHOR-002` | 10–90 | Compact topology and PostgreSQL/RuVector authority |
| `ARCHANCHOR-002` | 91–277 | Logical request, physical wiring, CodeDB ingress, execution, and result-return paths |
| `ARCHANCHOR-002` | 278–383 | redb live boundary, envctl bridge, and secret lifecycle |
| `ARCHANCHOR-002` | 384–506 | Cognition, edge inference, repository/task coordination, and import/export loops |
| `ARCHANCHOR-002` | 507–560 | Release/materialization and operational invariants |

## Authority order

1. Current owner instructions and repository operating contracts govern agent
   conduct, framework choices, safety, and installed-runtime ownership.
2. These exact-byte anchors govern the desired PostgreSQL/RuVector topology,
   ownership direction, operational round trips, and required build scope.
3. Owner-ratified decisions and maintained implementation contracts govern
   reconciled implementation choices.
4. Canonical task, claim, proof-ledger, and source records govern execution and
   evidence state. Legacy `.handoff` content is migration evidence only.
5. Generated indexes, graphs, reports, navigation, and status files are
   reproducible projections only.

Checked implementation and executable proof still determine whether an anchor
requirement is implemented. A polished anchor statement cannot make an absent
runtime current; an implementation gap becomes a named task and release gate.

## Ratified store model

- PostgreSQL with RuVector owns all durable macro-state and is the target Swarm
  Primary Runtime.
- Original bytes remain beside all derived vectors, graphs, indexes, summaries,
  manifests, and hashes.
- redb remains the subordinate transient, low-latency, single-owner tier. Its
  owner may publish an atomic read-only mmap projection and ordered wakeups;
  LifeOS never opens or maps the writable database file concurrently.
- AgentDB/RVF owns per-agent cognition only. It cannot own shared macro-state.
- envctl is the exclusive production PostgreSQL commit bridge and the
  database-controlled materialization/projection boundary.
- CodeDB/nu_plugin is the byte-complete ingress and typed query surface.
- Git, Meta, GitKB, ICM, files, worktrees, runners, terminals, models, and
  devices remain active physical surfaces, but after cutover their complete
  inputs, effects, results, and witnesses round-trip through PostgreSQL.

## Reconciliation surfaces

- [Anchor claim/task crosswalk](./anchor_claim_task_crosswalk.csv) maps the
  complete section/diagram requirement groups to canonical task and proof
  state.
- [Atomic requirement crosswalk](./anchor_atomic_requirement_crosswalk.json)
  gives every substantive anchor block an exact source range, digest,
  repository/component assignment, state, task, dependencies, contracts,
  tests, proof artifacts, conflict handling, and evidence-backed status.
- [Source contract receipts](./source_contract_receipts.json) inventory the
  active first-party repositories, worktrees, and applicable operating,
  architecture, build, security, testing, release, contribution, Planning
  Spine, and proof-ledger documents with hashes and dispositions.
- [Conflict ledger](./anchor_conflict_ledger.csv) records every discovered
  contract or current-state conflict and its controlling resolution.
- [Blueprint compatibility](../ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) retains
  current implementation corrections.
- [Blueprint task coverage](../ARCHITECTURE_BLUEPRINT_TASK_COVERAGE.md) owns the
  executable gap set, including `ARCHBP-038..048`.
- [Consolidation ledger](../../consolidation/README.md) retires the old handoff
  and pre-reset proof shadows without losing their bytes.

## Deterministic verification

```bash
bun run planning-spine:anchors:check
bun run planning-spine:anchor-crosswalk:check
bun run planning-spine:consolidation:check
bun run planning-spine:navigation:check
bun run planning-spine:verify
```

Do not hand-edit either anchor. Corrections belong in maintained compatibility,
conflict, authority, and task records.
