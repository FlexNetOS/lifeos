---
slug: tasks/blueprint-coordination-surfaces
title: "Coordination projections: Git/GitKB/meta/ICM/weave/rusty-idd/RuVix (§4.8, RV§20)"
type: task
status: draft
priority: high
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`coordination-surfaces` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Wire coordination tools as database-controlled projections (§4.8)
- Project weave, network-control, and rusty-idd into PostgreSQL (RV§20)
- Migrate ICM onto canonical RuVector schema (RV§20)
- Run RuVix/rvAgent under database tasks (RV§20)
- Re-review stale pins R08/R11/R12 and close R01 (R19)
- Keep Codex on official authentication only (DOC)
- Keep the conformance atlas and checks green (INV19)

## Acceptance Criteria

- [ ] Wire coordination tools as database-controlled projections — verified by: Records from each tool traceable to database rows
- [ ] Project weave, network-control, and rusty-idd into PostgreSQL — verified by: weave_message/weave_job/idd_ledger_event rows match local ledgers exactly
- [ ] Migrate ICM onto canonical RuVector schema — verified by: ICM queries execute via ruvector operators; original row bytes plus conversion lineage stored
- [ ] Run RuVix/rvAgent under database tasks — verified by: RuVix/rvAgent executions appear as task rows with RVF/witness outputs
- [ ] Re-review stale pins R08/R11/R12 and close R01 — verified by: re-review each named row against its current pinned revision
- [ ] Keep Codex on official authentication only — verified by: command ledger audit of manual changes
- [ ] Keep the conformance atlas and checks green — verified by: Mermaid parser suite; semantic crosswalk; component-table checks

## Context

- **Execution order:** 8 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-byte-capture-reconciliation]], [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-envctl-committer-security]], [[tasks/blueprint-codedb-ingress]], [[tasks/blueprint-ruvllm-agentdb-rvf]], [[tasks/blueprint-glass-svelte-migration]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T038, T159, T160, T161, T180, T185, T201 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.


## Obligations (full detail)

### T038 · §4.8 · Wire coordination tools as database-controlled projections

Git (import/export/review/recovery), GitKB (linked decisions/memory), meta (repository/workspace/release graph), beads_rust/br (executable task atoms), ICM (context manifests), rusty-idd (work orders, ledgers, proofs, runner integration), and weave (session mesh, durable messages, fenced jobs, runner dispatch) must all operate as PostgreSQL/RuVector-controlled projections with every record round-tripping to the database.

*Verification:* Records from each tool traceable to database rows

### T159 · RV§20 · Project weave, network-control, and rusty-idd into PostgreSQL

weave delivers tmux/Zellij/kitty/wezterm/screen injection, peers, presence, durable messages, asks, fenced job attempts, receipts, MCP, and runner dispatch with PostgreSQL storing authoritative message/job/attempt state; network-control mutations are gated by database policy and leases with plan/apply/rollback; rusty-idd/hf's redb ledger is a replayable local boundary whose complete ledger projects into PostgreSQL/RuVector.

*Verification:* weave_message/weave_job/idd_ledger_event rows match local ledgers exactly

### T160 · RV§20 · Migrate ICM onto canonical RuVector schema

ICM's PostgreSQL path must use the canonical RuVector schema and operators; imported ICM database records (originally pgvector `vector` rows) retain original row bytes and are converted into `ruvector` embeddings with transformation provenance, queried through canonical RuVector operators.

*Verification:* ICM queries execute via ruvector operators; original row bytes plus conversion lineage stored

### T161 · RV§20 · Run RuVix/rvAgent under database tasks

RuVix and rvAgent (capability-gated cognition-kernel scheduling, regions, queues, proofs, HAL/drivers, agent backends, middleware, tools, subagents, ACP, MCP, WASM, A2A) execute under database tasks and write RVF/witness results.

*Verification:* RuVix/rvAgent executions appear as task rows with RVF/witness outputs

### T180 · R19 · Re-review stale pins R08/R11/R12 and close R01

Pins are 4 days stale (nu_plugin 63d68743→931d48f, lifeos 3d741436→4707497, envctl on branch codex/profile-xdg-owner); R08/R11/R12 re-review scheduled as required work; R01 closes only when the Svelte target replaces the Vue entrypoint per its build-closure gate.

*Verification:* re-review each named row against its current pinned revision

### T185 · DOC · Keep Codex on official authentication only

Codex uses official ChatGPT authentication first; API-key execution disabled by default; browser/session-token workarounds, hidden mutations, and bulk rewrite scripts absent; manual changes reviewable, gated, recorded in the command ledger.

*Verification:* command ledger audit of manual changes

### T201 · INV19 · Keep the conformance atlas and checks green

All fifteen anchor sections, fourteen source diagrams, and ten anchor invariants must remain represented in the A01–A15 ledger and rendered as the D01–D24 Mermaid atlas; parser, path-walk, ownership, byte-lineage, and release-gate checks stay green.

*Verification:* Mermaid parser suite; semantic crosswalk; component-table checks

