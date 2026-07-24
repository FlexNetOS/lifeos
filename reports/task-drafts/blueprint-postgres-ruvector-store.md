---
slug: tasks/blueprint-postgres-ruvector-store
title: "PostgreSQL 17.10 + RuVector canonical store (§4.1, RV§3)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`postgres-ruvector-store` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Deploy PostgreSQL 17.10 with RuVector, no sidecars (§4.1)
- Install RuVector extension with pg17 feature (RV§3)
- Enable full-installation feature selection (RV§3)
- Store golden manifest of installed SQL surface (RV§3)
- Verify operators, opclasses, and access methods (RV§3)
- Verify shipped SQL artifact contents (RV§3)
- Persist durable cross-session memory in PostgreSQL projections (DOC)
- Implement WAL/PITR/reconstruction protection (INV13)

## Acceptance Criteria

- [ ] Deploy PostgreSQL 17.10 with RuVector, no sidecars — verified by: `SELECT extversion FROM pg_extension WHERE extname='ruvector'` on PG 17.10; no sidecar services present
- [ ] Install RuVector extension with pg17 feature — verified by: SELECT ruvector_version() succeeds; extension present in schema extensions
- [ ] Enable full-installation feature selection — verified by: feature-gated build succeeds and installed function set matches selection
- [ ] Store golden manifest of installed SQL surface — verified by: pg_proc function list matches the stored golden manifest
- [ ] Verify operators, opclasses, and access methods — verified by: catalog checks of pg_operator, pg_opclass, and pg_am
- [ ] Verify shipped SQL artifact contents — verified by: count named functions in installed SQL artifacts against 190 and 101
- [ ] Persist durable cross-session memory in PostgreSQL projections — verified by: query all memory surfaces from PostgreSQL after restart/reconstruction
- [ ] Implement WAL/PITR/reconstruction protection — verified by: backup/PITR drill; full reconstruction with row/count/hash checks

## Context

- **Execution order:** 3 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-install-activation-order]], [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-envctl-committer-security]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T030, T059, T060, T061, T062, T063, T182, T196 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- VERIFY-FIRST: completed tasks `tasks/yzx-iso/t4-1-postgres-datadir` and `tasks/yzx-iso/t4-2-ruvector-ext` claim PG 17.10 + extension installed. Treat as untrusted until re-verified (`SELECT extversion FROM pg_extension WHERE extname='ruvector'`).
- Grounding: ruvector/crates/ruvector-postgres/docs/ARCHITECTURE.md (SIMD dispatch, vector types, distance operators); crates/ruvector-postgres/docs/SQL_FUNCTIONS_REFERENCE.md.

## Obligations (full detail)

### T030 · §4.1 · Deploy PostgreSQL 17.10 with RuVector, no sidecars

PostgreSQL 17.10 plus the RuVector extension form the Central Cognitive Runtime supplying ACID, MVCC, RLS, advisory locks, triggers, background workers, WAL, streaming replication, base backup, and PITR; RuVector supplies database-local vector/hybrid/lexical/graph/GNN/causal/MinCut/routing/learning/embedding operations. The database hosts codebase bytes and semantic IDE structures with no vector or graph sidecar.

*Verification:* `SELECT extversion FROM pg_extension WHERE extname='ruvector'` on PG 17.10; no sidecar services present

### T059 · RV§3 · Install RuVector extension with pg17 feature

Build the RuVector PostgreSQL extension with pgrx and install it inside PostgreSQL with no vector, graph, or cognitive sidecar; the extension supports PostgreSQL 14/15/16/17 builds and this architecture installs the pg17 feature.

*Verification:* SELECT ruvector_version() succeeds; extension present in schema extensions

### T060 · RV§3 · Enable full-installation feature selection

The full installation builds with pg17, SIMD, storage, HNSW, API, parallelism, real embeddings, UUID support, learning, attention, GNN, routing, gated transformer, hyperbolic, sparse, graph, solver, math, and TDA paths, selected from the exact feature vocabulary (pg14–pg17; simd-*; index-hnsw/ivfflat/all; quantization-*; learning/attention/gnn/hyperbolic/sparse/graph/routing/embeddings; gated-transformer/solver/math-distances/tda/attention-extended/sona-learning/domain-expansion; ai-complete/graph-complete/all-features bundles).

*Verification:* feature-gated build succeeds and installed function set matches selection

### T061 · RV§3 · Store golden manifest of installed SQL surface

Feature gates select the installed subset of the 346 #[pg_extern]-annotated function definitions (344 unique identifiers; dag_export_state and dag_import_state each overloaded twice) across 43 files; the generated golden manifest of the installed subset is stored with each release.

*Verification:* pg_proc function list matches the stored golden manifest

### T062 · RV§3 · Verify operators, opclasses, and access methods

Confirm distance operators <-> (L2), <=> (cosine), <#> (negative inner product), + and - vector arithmetic; L1 only via ruvector_l1_distance() (no <+> operator exists); operator classes ruvector_l2_ops, ruvector_cosine_ops, ruvector_ip_ops plus sparse/array classes; index access methods hnsw and ruivfflat with ruhnsw_* diagnostics and scan/build/cost/maintenance/parallel/health/adaptive-probe/statistics hooks.

*Verification:* catalog checks of pg_operator, pg_opclass, and pg_am

### T063 · RV§3 · Verify shipped SQL artifact contents

The 1,300-line ruvector--0.3.0.sql artifact must emit 190 named SQL functions, the ruvector varlena type, six scalar/operator surfaces, the vector_sum aggregate, the hnsw and ruivfflat access methods, and cosine/L2/inner-product operator classes; ruvector--2.0.0.sql must emit 101 named functions.

*Verification:* count named functions in installed SQL artifacts against 190 and 101

### T182 · DOC · Persist durable cross-session memory in PostgreSQL projections

GitKB decisions/context/handoffs/repository knowledge/ledger links, meta repository/release/task/drift graphs, beads/br task atoms and dependencies, command ledger rows, handoff documents, and runner receipts live in PostgreSQL/RuVector projections; chat-session memory is disposable.

*Verification:* query all memory surfaces from PostgreSQL after restart/reconstruction

### T196 · INV13 · Implement WAL/PITR/reconstruction protection

PostgreSQL WAL, replication, base backup, PITR, restore drills, and reconstruction receipts must protect every state.

*Verification:* backup/PITR drill; full reconstruction with row/count/hash checks

