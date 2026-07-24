---
slug: tasks/blueprint-graph-gnn-causal
title: "Graph, GNN, causal, MinCut architecture (RV§5)"
type: task
status: draft
priority: high
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`graph-gnn-causal` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Model typed graph plane schema (RV§5)
- Wire ruvector-graph query surfaces (RV§5)
- Wire GNN learning with training lineage (RV§5)
- Wire FastGRNN/Tiny Dancer routing (RV§5)
- Record causal graph and wire causal traversal (RV§5)
- Run dynamic MinCut failure isolation (RV§5)
- Wire condensation, sparsification, and gated inference (RV§5)
- Wire self-healing graph repair loop (RV§5)
- Implement cut-based safe task partitioning (RV§5)
- Attach mandatory identifiers to all nodes/edges (RV§5)

## Acceptance Criteria

- [ ] Model typed graph plane schema — verified by: node/edge type catalog matches the blueprint enumeration
- [ ] Wire ruvector-graph query surfaces — verified by: ruvector_cypher and ruvector_sparql queries succeed over the graph plane
- [ ] Wire GNN learning with training lineage — verified by: ruvector_gnn_train run records source and training lineage
- [ ] Wire FastGRNN/Tiny Dancer routing — verified by: ruvector_route returns an agent from the registered set
- [ ] Record causal graph and wire causal traversal — verified by: causal traversal isolates root cause on a seeded test case
- [ ] Run dynamic MinCut failure isolation — verified by: ruvector_mincut isolates a seeded failure domain
- [ ] Wire condensation, sparsification, and gated inference — verified by: gated_transformer_gate_decision limits inference to gated regions
- [ ] Wire self-healing graph repair loop — verified by: healing worker repairs a seeded inconsistency via a branch gate
- [ ] Implement cut-based safe task partitioning — verified by: partition assignment yields non-overlapping agent scopes
- [ ] Attach mandatory identifiers to all nodes/edges — verified by: constraint audit; projection-delete test preserves source bytes and history

## Context

- **Execution order:** 9 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-data-schema]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-cow-branching]], [[tasks/blueprint-retrieval-indexing]], [[tasks/blueprint-sona-rl]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T074, T075, T076, T077, T078, T079, T080, T081, T082, T083 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.


## Obligations (full detail)

### T074 · RV§5 · Model typed graph plane schema

Store typed nodes for repositories, commits, trees, files, chunks, AST elements, symbols, types, crates, packages, build units, tests, tasks, agents, prompts, models, adapters, secrets, executions, artifacts, releases, forecasts, and witnesses, with typed edges for containment, definition, reference, call, import, dependency, build input, generated-from, transformed-by, executed-by, authorized-by, caused, observed, failed-with, repaired-by, supersedes, belongs-to-branch, promoted-from, and attested-by.

*Verification:* node/edge type catalog matches the blueprint enumeration

### T075 · RV§5 · Wire ruvector-graph query surfaces

Wire ruvector-graph to supply property graph storage, Cypher, RDF, SPARQL, adjacency, shortest path, weighted path, and dynamic updates.

*Verification:* ruvector_cypher and ruvector_sparql queries succeed over the graph plane

### T076 · RV§5 · Wire GNN learning with training lineage

Wire ruvector-gnn, GraphSAGE, GCN, message passing, attention, graph transformers, and GNN reranking to learn local and global structure while retaining exact source and training lineage.

*Verification:* ruvector_gnn_train run records source and training lineage

### T077 · RV§5 · Wire FastGRNN/Tiny Dancer routing

Wire FastGRNN/Tiny Dancer to route requests, contexts, models, tools, agents, and escalation tiers from low-cost recurrent state.

*Verification:* ruvector_route returns an agent from the registered set

### T078 · RV§5 · Record causal graph and wire causal traversal

Record interventions, observations, temporal order, dependency direction, justification paths, recall certificates, and counterfactual branch results; causal traversal must power breakage prediction, code-edit verification, dependency verification, and root-cause isolation.

*Verification:* causal traversal isolates root cause on a seeded test case

### T079 · RV§5 · Run dynamic MinCut failure isolation

Run RuVector MinCut subpolynomial dynamic minimum-cut over changing dependency, task, memory, model, and failure graphs to isolate failure domains, hallucination/drift boundaries, compromised or ungrounded endpoints, unstable release regions, and toxic feedback loops.

*Verification:* ruvector_mincut isolates a seeded failure domain

### T080 · RV§5 · Wire condensation, sparsification, and gated inference

Apply graph condensation and sparsification that retain cut structure while reducing execution cost; use ruvector-attn-mincut and gated transformers to restrict expensive inference to high-value connected regions.

*Verification:* gated_transformer_gate_decision limits inference to gated regions

### T081 · RV§5 · Wire self-healing graph repair loop

Deploy self-healing workers that detect disconnected, stale, contradictory, or weakly grounded regions; propose repair edges; replay affected paths; validate witnesses; and merge repairs through branch gates.

*Verification:* healing worker repairs a seeded inconsistency via a branch gate

### T082 · RV§5 · Implement cut-based safe task partitioning

Use cut boundaries and dependency direction to allocate non-overlapping work to agents, forming the failure isolation, repair, replay, and promotion loop (swarm immune-system behavior).

*Verification:* partition assignment yields non-overlapping agent scopes

### T083 · RV§5 · Attach mandatory identifiers to all nodes/edges

Every node and edge carries tenant, branch, generation, source object, source range, relation type, weight, causal direction, creator execution, valid-time, transaction-time, policy, and witness identifiers; deleting a projection never deletes its source bytes or historical edge generations.

*Verification:* constraint audit; projection-delete test preserves source bytes and history

