---
slug: tasks/blueprint-witness-chain
title: "SHAKE256 witness chains and anti-bluff (RV§10, INV12)"
type: task
status: draft
priority: high
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`witness-chain` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Attach witness record to every event (RV§10)
- Compute canonical SHAKE256 witness digest (RV§10)
- Dual-carry witness chain in RVF and PostgreSQL (RV§10)
- Implement claim verification against source bytes (RV§10)
- Implement code-edit and dependency verification (RV§10)
- Implement SHAKE256 witness chains transactionally (INV12)

## Acceptance Criteria

- [ ] Attach witness record to every event — verified by: sampled event rows contain the complete chain record fields
- [ ] Compute canonical SHAKE256 witness digest — verified by: recomputed digest matches the stored witness digest
- [ ] Dual-carry witness chain in RVF and PostgreSQL — verified by: RVF chain and PostgreSQL chain equivalence check
- [ ] Implement claim verification against source bytes — verified by: a seeded ungrounded claim is rejected by verification
- [ ] Implement code-edit and dependency verification — verified by: edit and dependency verification pass on a test change
- [ ] Implement SHAKE256 witness chains transactionally — verified by: recompute entire chain; source endpoint resolution; tamper test; signature and replay verification

## Context

- **Execution order:** 5 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-byte-capture-reconciliation]], [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-data-schema]], [[tasks/blueprint-cow-branching]], [[tasks/blueprint-codedb-ingress]], [[tasks/blueprint-ruvllm-agentdb-rvf]], [[tasks/blueprint-graph-gnn-causal]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T109, T110, T111, T112, T113, T195 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.


## Obligations (full detail)

### T109 · RV§10 · Attach witness record to every event

Every source assertion, retrieved context, model claim, code edit, dependency conclusion, graph edge, task result, package output, build artifact, release, adapter update, and promotion carries a cryptographic witness whose chain record includes sequence, previous SHAKE256, event kind, tenant, branch, request, execution, source object/chunk/range, vector/graph identities, input digest, output digest, tool/model/adapter revision, policy, time, signer, and signature.

*Verification:* sampled event rows contain the complete chain record fields

### T110 · RV§10 · Compute canonical SHAKE256 witness digest

The canonical witness digest is SHAKE256 over a domain-separated canonical encoding of the record and every referenced byte digest.

*Verification:* recomputed digest matches the stored witness digest

### T111 · RV§10 · Dual-carry witness chain in RVF and PostgreSQL

RVF WITNESS and CRYPTO segments carry the portable chain; PostgreSQL rows carry the authoritative sequence, source-vector linkage, causal lineage, signatures, verification outcome, and full referenced bytes.

*Verification:* RVF chain and PostgreSQL chain equivalence check

### T112 · RV§10 · Implement claim verification against source bytes

Claim verification resolves every endpoint to stored source bytes, checks object and vector identities, traverses causal and dependency edges, replays transformations, and rejects ungrounded graph endpoints.

*Verification:* a seeded ungrounded claim is rejected by verification

### T113 · RV§10 · Implement code-edit and dependency verification

Code-edit verification reconstructs before/after bytes, AST and symbol diffs, tests, compiler output, and branch provenance; dependency verification checks the exact lockfile, crate/package, feature, build, binary, and release closure; tamper evidence, replayable audit history, and complete provenance extend from initial ingress through release activation.

*Verification:* edit and dependency verification pass on a test change

### T195 · INV12 · Implement SHAKE256 witness chains transactionally

SHAKE256 witnesses bind source bytes, vectors, graph/causal lineage, transformations, executions, model state, artifacts, and releases; witness append occurs in the same transaction as the governed event.

*Verification:* recompute entire chain; source endpoint resolution; tamper test; signature and replay verification

