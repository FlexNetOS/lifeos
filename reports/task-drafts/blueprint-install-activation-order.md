---
slug: tasks/blueprint-install-activation-order
title: "Install/activation order spine (RV§17 steps 1–15)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`install-activation-order` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Provision toolchains; implement rtk_nu and redb-owner (step 2) (RV§17)
- Install and configure PostgreSQL 17.10 (step 3) (RV§17)
- Install RuVector extension and verify all families (step 4) (RV§17)
- Apply migrations 0001–0015 and initialize (step 5) (RV§17)
- Build and activate envctl (step 6) (RV§17)
- Import all host state and build derived generations (step 8) (RV§17)
- Connect model runtime and prove I/O capture (step 9) (RV§17)
- Build rusty-idd/hf and flexnetos_runner with proofs (step 11) (RV§17)
- Build network-control and execute controlled mutation (step 12) (RV§17)
- Run all release gates then promote and cut over (steps 14–15) (RV§17)
- Follow the numbered install/activation order (DOC)

## Acceptance Criteria

- [ ] Provision toolchains; implement rtk_nu and redb-owner (step 2) — verified by: Both new components pinned and witnessed; owner survives stale-reader and corruption-fallback tests
- [ ] Install and configure PostgreSQL 17.10 (step 3) — verified by: pg_config --version = PostgreSQL 17.10; database ruvector exists with checksums enabled
- [ ] Install RuVector extension and verify all families (step 4) — verified by: EXPLAIN of <=> query uses hnsw; each named family returns results
- [ ] Apply migrations 0001–0015 and initialize (step 5) — verified by: Migration table shows 0001–0015 applied; initialization rows present
- [ ] Build and activate envctl (step 6) — verified by: envctl lifecycle verification passes against the live database
- [ ] Import all host state and build derived generations (step 8) — verified by: Import receipts prove tree/object/byte equivalence; derived generations queryable
- [ ] Connect model runtime and prove I/O capture (step 9) — verified by: Model invocation and learned-state rows complete for a test inference
- [ ] Build rusty-idd/hf and flexnetos_runner with proofs (step 11) — verified by: Runner rejects unsigned JobSpec; receipts queryable in lifeos_coord.runner_receipt
- [ ] Build network-control and execute controlled mutation (step 12) — verified by: Dry-run plan and applied mutation with rollback evidence stored in network_plan/network_effect
- [ ] Run all release gates then promote and cut over (steps 14–15) — verified by: Every gate result stored; cutover completes without destroying the user session
- [ ] Follow the numbered install/activation order — verified by: activation blocked until prior steps verify; step-order audit

## Context

- **Execution order:** 1 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-byte-capture-reconciliation]], [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-rtk-rtk-nu-envelope]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-cow-branching]], [[tasks/blueprint-data-schema]], [[tasks/blueprint-envctl-committer-security]], [[tasks/blueprint-redb-state-plane]], [[tasks/blueprint-codedb-ingress]], [[tasks/blueprint-retrieval-indexing]], [[tasks/blueprint-sona-rl]], [[tasks/blueprint-ruvllm-agentdb-rvf]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T141, T142, T143, T144, T145, T147, T148, T150, T151, T153, T188 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- This task is the ordering spine: its 15 numbered steps sequence every sibling task. Authority gates are sequential (PostgreSQL health → schema → CodeDB parity → import → cognition → executors → LifeOS → release); work within a level may run concurrently.

## Obligations (full detail)

### T141 · RV§17 · Provision toolchains; implement rtk_nu and redb-owner (step 2)

Provision meta graph (loop_lib, meta_plugin_protocol, meta-ruvector), lane, Yazelix/Nix/Nushell, Rust toolchains, Bun, PostgreSQL libraries, cargo-pgrx, approved ruvllm/Candle executors, optional gated ONNX Runtime, CUDA/NVIDIA, and musl linkers. Implement, package, pin, and witness the missing rtk_nu adapter and flexnetos-redb-owner service including versioned mmap projection format, atomic multi-slot publisher, permissions, event protocol, stale-reader recovery, and corruption fallback.

*Verification:* Both new components pinned and witnessed; owner survives stale-reader and corruption-fallback tests

### T142 · RV§17 · Install and configure PostgreSQL 17.10 (step 3)

Install PostgreSQL 17.10; configure checksums, WAL archive, replication, backup roles, TLS/socket policy, and recovery; create the `ruvector` database.

*Verification:* pg_config --version = PostgreSQL 17.10; database ruvector exists with checksums enabled

### T143 · RV§17 · Install RuVector extension and verify all families (step 4)

Build and install RuVector PostgreSQL with pg17, index-all, quant-all, graph-complete, ai-complete-v3, analytics-complete, and all-features-v3; verify a real `<=>` plan and result, HNSW/IVF access methods, graph, BM25, GNN, FastGRNN, SONA, MinCut, workers, and all function families.

*Verification:* EXPLAIN of <=> query uses hnsw; each named family returns results

### T144 · RV§17 · Apply migrations 0001–0015 and initialize (step 5)

Apply migrations 0001 through 0015; initialize identities, RLS, tasks, byte store, semantic/index generations, COW branches, AgentDB/RVF, witnesses, security, coordination, release, backup, and restore drills.

*Verification:* Migration table shows 0001–0015 applied; initialization rows present

### T145 · RV§17 · Build and activate envctl (step 6)

Build envctl and agent-env/security binaries; activate ruvector, ruvector-pg, and authorized ruvector-cuda paths; run PostgreSQL/RuVector lifecycle detection, installation, repair, and verification.

*Verification:* envctl lifecycle verification passes against the live database

### T147 · RV§17 · Import all host state and build derived generations (step 8)

Import ALL host repositories, files, binaries, models, configs, caches, logs, histories, metadata, secrets in protected form, and existing redb/SQLite/libSQL/ICM/AgentDB/RVF state; build AST, symbol, lexical, embedding, graph, causal, and witness generations.

*Verification:* Import receipts prove tree/object/byte equivalence; derived generations queryable

### T148 · RV§17 · Connect model runtime and prove I/O capture (step 9)

Build and connect ruvllm, RuvLTRA, SONA, RVF, AgentDB, Ruflo, ATAS, Node/NAPI, WASM, TypeScript, Bun, model weights, adapters, ONNX/Candle/CUDA paths, and device drivers; prove complete model I/O and learned-state capture.

*Verification:* Model invocation and learned-state rows complete for a test inference

### T150 · RV§17 · Build rusty-idd/hf and flexnetos_runner with proofs (step 11)

Build rusty-idd/hf after meta-ruvector; build flexnetos_runner after weave/envctl/CodeDB; prove handoff replay, signed JobSpec admission, raw logs, CodeDB proof manifest, and database-queryable receipts.

*Verification:* Runner rejects unsigned JobSpec; receipts queryable in lifeos_coord.runner_receipt

### T151 · RV§17 · Build network-control and execute controlled mutation (step 12)

Build network-control after lane; exercise JSON dry runs; execute a database-authorized controlled network mutation; capture packet/API/command bytes, plan, acknowledgement, and rollback evidence.

*Verification:* Dry-run plan and applied mutation with rollback evidence stored in network_plan/network_effect

### T153 · RV§17 · Run all release gates then promote and cut over (steps 14–15)

Run build, test, security, byte reconstruction, retrieval, graph, MinCut, learning, model, forecast, release, backup, and restore gates, storing all gate inputs and results; then PostgreSQL/RuVector promotes the winning branch, envctl materializes it, Nix produces the closure, flexnetos_runner proves it, and atomic symlink activation plus Yazelix/Zellij session-preserving reload completes cutover. Authority gates remain sequential: PostgreSQL/RuVector health → canonical schema → CodeDB byte parity → full import → cognition/model runtime → executors and coordination → LifeOS → release activation; work within a level may run concurrently.

*Verification:* Every gate result stored; cutover completes without destroying the user session

### T188 · DOC · Follow the numbered install/activation order

Components install in the integration table's numbered order (Nushell/Yazelix/Nix 2, PostgreSQL 3, RuVector extension 4, witness runtime 5, redb/envctl/secrets 6, CodeDB 7, Git surfaces 8, RuVector members/models 9, rtk/rtk_nu/ICM/weave 10, runners 11, network/hardware 12, LifeOS 13).

*Verification:* activation blocked until prior steps verify; step-order audit

