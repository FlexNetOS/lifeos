---
slug: tasks/blueprint-cow-branching
title: "Copy-on-write branching, merge gates, pointer promotion (RV§6, INV11)"
type: task
status: draft
priority: high
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`cow-branching` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Create lifeos_runtime.branch table (RV§6)
- Create branch_overlay table (RV§6)
- Implement branch resolution views (RV§6)
- Route branch-scoped writes to overlays only (RV§6)
- Write immutable gate results against branch head (RV§6)
- Implement merge with conflict records and witness (RV§6)
- Implement gated promotion and rollback pointers (RV§6)
- Mirror branch membership into RVF and round-trip (RV§6)
- Implement COW branch gates and pointer promotion (INV11)

## Acceptance Criteria

- [ ] Create lifeos_runtime.branch table — verified by: table exists with all required columns
- [ ] Create branch_overlay table — verified by: overlay write test records ordered change sequence
- [ ] Implement branch resolution views — verified by: branch view query returns correct overlay precedence at one snapshot
- [ ] Route branch-scoped writes to overlays only — verified by: canonical base rows unchanged after branch writes
- [ ] Write immutable gate results against branch head — verified by: gate result rows are immutable and pinned to the branch head
- [ ] Implement merge with conflict records and witness — verified by: merge test produces conflict record plus appended witness in one serializable transaction
- [ ] Implement gated promotion and rollback pointers — verified by: rollback test re-materializes a prior generation byte-perfect
- [ ] Mirror branch membership into RVF and round-trip — verified by: overlay round-trip completes before execution ack
- [ ] Implement COW branch gates and pointer promotion — verified by: generation append; promotion/rollback pointer and byte verification; branch-isolation tests

## Context

- **Execution order:** 5 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-data-schema]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-ruvllm-agentdb-rvf]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T084, T085, T086, T087, T088, T089, T090, T091, T194 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.


## Obligations (full detail)

### T084 · RV§6 · Create lifeos_runtime.branch table

lifeos_runtime.branch records parent branch, base commit LSN, creator, purpose, policy, model/adapters, and branch kind.

*Verification:* table exists with all required columns

### T085 · RV§6 · Create branch_overlay table

branch_overlay records table, logical key, operation, base row digest, replacement row bytes/JSONB, and ordered change sequence.

*Verification:* overlay write test records ordered change sequence

### T086 · RV§6 · Implement branch resolution views

Branch views resolve overlay → nearest ancestor → canonical base at a single MVCC snapshot; original byte objects remain content-addressed and referenced from every branch without duplication.

*Verification:* branch view query returns correct overlay precedence at one snapshot

### T087 · RV§6 · Route branch-scoped writes to overlays only

Agent proposals, isolated refactors, prompt variants, package variants, generated configuration trials, build/test branches, simulated future branches, and release-candidate branches write only to their overlay and branch-scoped derived generations.

*Verification:* canonical base rows unchanged after branch writes

### T088 · RV§6 · Write immutable gate results against branch head

Build, test, static analysis, forecast, security, causal, dependency, byte-reconstruction, and witness gates write immutable results against the exact branch head.

*Verification:* gate result rows are immutable and pinned to the branch head

### T089 · RV§6 · Implement merge with conflict records and witness

Merge computes key, byte, AST, semantic, graph, policy, and release conflicts; conflict records preserve both inputs and resolution bytes; a serializable transaction applies the accepted overlay, advances the parent generation, and appends a SHAKE256 witness.

*Verification:* merge test produces conflict record plus appended witness in one serializable transaction

### T090 · RV§6 · Implement gated promotion and rollback pointers

Winning-timeline promotion changes the active branch pointer only after every gate succeeds; atomic activation follows database promotion; rollback changes the pointer to a prior witnessed generation and re-materializes its exact projections.

*Verification:* rollback test re-materializes a prior generation byte-perfect

### T091 · RV§6 · Mirror branch membership into RVF and round-trip

RVF COW_MAP and MEMBERSHIP segments mirror branch membership for portable agents; AgentDB and RVF round-trip their overlays to the PostgreSQL branch rows before execution acknowledgement.

*Verification:* overlay round-trip completes before execution ack

### T194 · INV11 · Implement COW branch gates and pointer promotion

COW branches isolate proposals and simulations; witnessed merge gates and pointer promotion select winning timelines; rollback is exact.

*Verification:* generation append; promotion/rollback pointer and byte verification; branch-isolation tests

