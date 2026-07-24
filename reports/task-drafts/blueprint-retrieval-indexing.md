---
slug: tasks/blueprint-retrieval-indexing
title: "Retrieval, HNSW/IVF indexing, embedding projections (RV§4, RV§16)"
type: task
status: draft
priority: high
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`retrieval-indexing` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Implement unified database-local retrieval plan (RV§4)
- Create metadata-first filter indexes (RV§4)
- Configure lexical BM25 retrieval (RV§4)
- Configure tiered vector indexes per workload (RV§4)
- Implement hyperbolic hierarchy retrieval (RV§4)
- Persist fusion configuration and ranking state (RV§4)
- Record per-generation embedding provenance (RV§4)
- Wire semantic IDE retrieval in one snapshot (RV§4)
- Wire index-maintenance background workers (RV§4)
- Create dimension-specific embedding projections and RuVector indexes (RV§16)

## Acceptance Criteria

- [ ] Implement unified database-local retrieval plan — verified by: end-to-end retrieval query returns byte objects with provenance and witnesses
- [ ] Create metadata-first filter indexes — verified by: EXPLAIN shows metadata predicates applied before similarity execution
- [ ] Configure lexical BM25 retrieval — verified by: exact-identifier lexical query returns the expected record
- [ ] Configure tiered vector indexes per workload — verified by: per-workload index type present; ruhnsw_stats reports healthy index
- [ ] Implement hyperbolic hierarchy retrieval — verified by: ruvector_poincare_distance queries return hierarchy-consistent neighbors
- [ ] Persist fusion configuration and ranking state — verified by: a past query's ranking is reconstructable from stored state
- [ ] Record per-generation embedding provenance — verified by: provenance join resolves for every embedding row; old generation preserved after model update
- [ ] Wire semantic IDE retrieval in one snapshot — verified by: single-transaction IDE query test spans definition-to-bytes join
- [ ] Wire index-maintenance background workers — verified by: generation advance is atomic and a prior generation reconstructs
- [ ] Create dimension-specific embedding projections and RuVector indexes — verified by: Insert of wrong-dimension embedding rejected; HNSW/ruivfflat indexes usable in plans

## Context

- **Execution order:** 8 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-data-schema]], [[tasks/blueprint-codedb-ingress]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T065, T066, T067, T068, T069, T070, T071, T072, T073, T134 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.


## Obligations (full detail)

### T065 · RV§4 · Implement unified database-local retrieval plan

Wire retrieval as one database-local plan: identity+tenant+branch+authorization+JSONB metadata predicate → lexical BM25 set → dense/sparse/hyperbolic/late-interaction vector sets → HNSW/ACORN/DiskANN/LSM-ANN/IVF/PQ/RaBitQ execution → reciprocal-rank, relative-score, calibrated fusion → GNN/attention/causal/cross-encoder reranking → exact byte objects plus AST/symbol/dependency context, provenance, witnesses.

*Verification:* end-to-end retrieval query returns byte objects with provenance and witnesses

### T066 · RV§4 · Create metadata-first filter indexes

Create B-tree and GIN indexes constraining repository, crate, language, record kind, branch, visibility, policy, commit, path, time, symbol kind, build, agent, and lease before similarity work; ACORN and capability-gated indexes carry filter predicates into ANN traversal.

*Verification:* EXPLAIN shows metadata predicates applied before similarity execution

### T067 · RV§4 · Configure lexical BM25 retrieval

Configure PostgreSQL tsvector/GIN and RuVector sparse BM25 (pg_sparse_bm25) storing terms, field lengths, weights, and analyzer provenance so exact identifiers, diagnostics, paths, compiler errors, and rare symbols remain retrievable without semantic dilution.

*Verification:* exact-identifier lexical query returns the expected record

### T068 · RV§4 · Configure tiered vector indexes per workload

Configure the hnsw access method as the default hot semantic index (diagnostics via ruhnsw_*); DiskANN/SPANN for disk scale; LSM-ANN for high-write agent memory; Matryoshka and PQ/RaBitQ for compute/storage reduction; IVFFlat for bulk partitions; support cosine, dot-product, L2, L1, sparse, binary/scalar/product quantized, and MaxSim similarity.

*Verification:* per-workload index type present; ruhnsw_stats reports healthy index

### T069 · RV§4 · Implement hyperbolic hierarchy retrieval

Represent repository, type, dependency, task, and agent hierarchies as Poincaré and Lorentz embeddings; use Möbius addition and exponential/log maps to preserve hierarchy during updates and reranking.

*Verification:* ruvector_poincare_distance queries return hierarchy-consistent neighbors

### T070 · RV§4 · Persist fusion configuration and ranking state

Retain component scores for BM25, dense, sparse, hyperbolic, graph, MaxSim, attention, and recency signals; store fusion configuration, normalization, query plan, retrieval-set membership, discarded results, and final ranking.

*Verification:* a past query's ranking is reconstructable from stored state

### T071 · RV§4 · Record per-generation embedding provenance

Each embedding must reference exact input object/chunk ranges, AST/symbol identity, preprocessing, model digest, tokenizer, dimensions, dtype, quantizer, adapter, SONA state, device, parameters, timestamps, and witness entry; a model update creates a new embedding generation rather than overwriting lineage.

*Verification:* provenance join resolves for every embedding row; old generation preserved after model update

### T072 · RV§4 · Wire semantic IDE retrieval in one snapshot

Join file/repository/workspace/crate/module/AST/symbol/function/type/call/diagnostic/test/build/documentation retrieval directly to byte-complete objects; definition, reference, call hierarchy, dependency impact, semantic diff, breakage prediction, and edit context execute within the same transaction snapshot.

*Verification:* single-transaction IDE query test spans definition-to-bytes join

### T073 · RV§4 · Wire index-maintenance background workers

Ingress enqueues lexical, embedding, graph, and index refresh work; background workers claim database leases, build derived records, validate coverage and recall, attach witnesses, and atomically advance the active generation; old generations remain reconstructable.

*Verification:* generation advance is atomic and a prior generation reconstructs

### T134 · RV§16 · Create dimension-specific embedding projections and RuVector indexes

Use lifeos_semantic.create_embedding_index to create ruvector(384), ruvector(768), and model-native-dimension projection tables with HNSW indexes over ruvector_cosine_ops/l2_ops/ip_ops and ruivfflat cosine indexes so operator classes validate shape; enforce_embedding_projection validates dimensions on insert/update.

*Verification:* Insert of wrong-dimension embedding rejected; HNSW/ruivfflat indexes usable in plans

