---
slug: tasks/blueprint-envctl-committer-security
title: "envctl sole committer, drain/embed/commit loop, six secret subsystems (§4.7, §5, RV§13, R10–R11)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`envctl-committer-security` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Wire LifeOS control-action route through envctl authorization (§3.2)
- Wire durable materialization route through envctl-only credentials (§3.2)
- Wire database-to-engine and database-to-glass return paths (§3.2)
- Restrict direct PostgreSQL writes to envctl (§3.4)
- Implement the envctl drain/embed/commit loop (§4.7)
- Establish the permanent table-conversion flow (§4.7)
- Implement the six envctl secret subsystems (§5)
- Bootstrap security schemas and encrypted secret custody (§5)
- Implement rotation and revocation with proven cutover (§5)
- Enforce plaintext exposure boundaries (§5)
- Build envctl workspace binaries (RV§2)
- Implement envctl four coupled paths (RV§13)
- Generate all materialized configs with provenance markers (RV§13)
- Build envctl with ruvector feature bundles (RV§13)
- Lock down function grants to envctl commit capability (RV§16)
- Implement atomic activation with exact rollback (REL)
- Withhold production PG-write credentials from CodeDB (R10)
- Implement envctl drain/embed/commit worker (R11)
- Implement files-to-tables-to-generated-files conversion (DOC)
- Stamp provenance on all generated outputs (DOC)
- Generate Yazelix configuration from database rows (DOC)
- Enforce envctl-only commit capability in the database (INV07)
- Implement the six-subsystem secret lifecycle (INV08)

## Acceptance Criteria

- [ ] Wire LifeOS control-action route through envctl authorization — verified by: UI completion only appears after commit identity+witness attached
- [ ] Wire durable materialization route through envctl-only credentials — verified by: Only envctl role holds authoritative PG write credential; commit receipt returned to redb
- [ ] Wire database-to-engine and database-to-glass return paths — verified by: Pending vs complete UI states distinguished by presence of commit identity
- [ ] Restrict direct PostgreSQL writes to envctl — verified by: Audit DB roles: no authoritative write grant for plugin/agent roles
- [ ] Implement the envctl drain/embed/commit loop — verified by: End-to-end drain→embed→commit→project cycle demonstrated; release gate
- [ ] Establish the permanent table-conversion flow — verified by: A config round-trips rows→tables→files and back with source files retained
- [ ] Implement the six envctl secret subsystems — verified by: A secret request traverses Engine→Broker→Mint/Vault→Relay→target with full audit capture
- [ ] Bootstrap security schemas and encrypted secret custody — verified by: Security schemas populated; secret bytes in encrypted custody with bootstrap audit records
- [ ] Implement rotation and revocation with proven cutover — verified by: Rotate a secret and verify old authority retired with cutover proof; revoke and verify relay blocked
- [ ] Enforce plaintext exposure boundaries — verified by: Scan redb, logs, UI state, and model context for absence of root plaintext
- [ ] Build envctl workspace binaries — verified by: four bins build; envctl --version reports 0.1.0
- [ ] Implement envctl four coupled paths — verified by: envctl_row generations round-trip with witness identifiers; symlink activation preserves live Zellij session
- [ ] Generate all materialized configs with provenance markers — verified by: Every generated file header carries generator revision, source generation, checksum, and do-not-edit marker
- [ ] Build envctl with ruvector feature bundles — verified by: envctl builds with these features; redb event log fully reconciled into PG
- [ ] Lock down function grants to envctl commit capability — verified by: Attempted ingest_event as lifeos_runtime fails; succeeds only as lifeos_envctl
- [ ] Implement atomic activation with exact rollback — verified by: activation flip test; rollback-target restoration; session-preserving reload check
- [ ] Withhold production PG-write credentials from CodeDB — verified by: database role/grant audit; negative direct-write test
- [ ] Implement envctl drain/embed/commit worker — verified by: idempotent drain/embed/commit/restart tests; vector provenance; capability-denial; crash/replay
- [ ] Implement files-to-tables-to-generated-files conversion — verified by: envctl table checksums and generated-file checksums verified at the runner gate
- [ ] Stamp provenance on all generated outputs — verified by: inspect generated files for complete provenance headers
- [ ] Generate Yazelix configuration from database rows — verified by: clean shell/login; session-preserving reload; config provenance check
- [ ] Enforce envctl-only commit capability in the database — verified by: role/grant audit; negative direct-write tests from plugin/agent roles
- [ ] Implement the six-subsystem secret lifecycle — verified by: allow/deny, expiry, rotation, revocation, replay, cross-target, audit-chain, root-plaintext-exclusion tests

## Context

- **Execution order:** 6 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-install-activation-order]], [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-data-schema]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-redb-state-plane]], [[tasks/blueprint-codedb-ingress]], [[tasks/blueprint-ruvllm-agentdb-rvf]], [[tasks/blueprint-glass-engine-frontdoor]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T012, T016, T017, T029, T035, T036, T041, T042, T043, T044, T058, T121, T122, T123, T137, T164, T174, T175, T181, T184, T187, T191, T192 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- VERIFY-FIRST: completed tasks `tasks/yzx-iso/t4-4-envctl-committer` and `t4-6-secret-plane` claim committer routing and secret migration; R11 says the drain/embed/commit worker was absent at rev 48368a97 (envctl now on branch codex/profile-xdg-owner per R19). Re-audit against the live checkout.

## Obligations (full detail)

### T012 · §3.2 · Wire LifeOS control-action route through envctl authorization

Path: Svelte control → Tauri command plus complete CodeDB request envelope → redb owner → envctl validation → PostgreSQL/RuVector authorization/task/grant/branch/lease → envctl-controlled dispatch → execution surface → result ingestion. The Tauri capture client uses the same versioned CodeDB envelope schema as plugin ingress; no effect is reported complete until the durable return attaches its PostgreSQL commit identity and witness.

*Verification:* UI completion only appears after commit identity+witness attached

### T016 · §3.2 · Wire durable materialization route through envctl-only credentials

Path: redb owner ordered WAL → envctl validation/policy/idempotency → database-authorized embedding executor when required → codedb-store-pg under envctl-only credentials → PostgreSQL/RuVector transaction → commit LSN/witness → redb acknowledgement/event.

*Verification:* Only envctl role holds authoritative PG write credential; commit receipt returned to redb

### T017 · §3.2 · Wire database-to-engine and database-to-glass return paths

Return routes: DB task/state/policy/grant/lease → envctl-validated CodeDB query/projection/materialization → redb projection/event and/or controlled Yazelix task → PTY/structured result → complete ingestion → DB; and DB committed generation → envctl-controlled CodeDB typed projection → redb owner commit/event → Tauri/Svelte view → user acknowledgement/effect capture → durable materialization. Speculative local state may show pending; completion displays only after its PostgreSQL commit identity attaches.

*Verification:* Pending vs complete UI states distinguished by presence of commit identity

### T029 · §3.4 · Restrict direct PostgreSQL writes to envctl

CodeDB's direct PostgreSQL store (`codedb-store-pg`) is restricted to parity tests, bootstrap/import, read-only query, repair, or migration roles carrying explicit database grants; production plugin/agent roles receive no authoritative PostgreSQL write credential — envctl is the only component permitted to execute the authoritative CodeDB PostgreSQL mapping and commit. MessagePack is the Nu plugin process protocol only, not the redb on-disk format.

*Verification:* Audit DB roles: no authoritative write grant for plugin/agent roles

### T035 · §4.7 · Implement the envctl drain/embed/commit loop

envctl must drain ordered redb records, validate policy and idempotency, orchestrate a database-authorized embedding executor when a target schema requires vectors, invoke the CodeDB PostgreSQL mapping with envctl-only credentials, record the commit identity, and project worktrees, Nix inputs, runtime configuration, and activation state. The pinned envctl checkout does not implement this loop; the loop and its capability enforcement are release gates.

*Verification:* End-to-end drain→embed→commit→project cycle demonstrated; release gate

### T036 · §4.7 · Establish the permanent table-conversion flow

The permanent operational flow is `database rows ↔ validated envctl tables ↔ Nushell tables ↔ controlled files`, with original source files retained as evidence; envctl is materializer, synchronization boundary, configuration-table operator, security boundary, projection manager, and activation interface.

*Verification:* A config round-trips rows→tables→files and back with source files retained

### T041 · §5 · Implement the six envctl secret subsystems

Build Secret Engine (policy evaluation, issuance/renewal/rotation/revocation coordination), Secret Broker (requester authentication, lease resolution, least privilege, transaction recording), Secret Mint (short-lived purpose-bound scoped credential derivation), Seed Vault (root seeds, wrapping keys, identity roots, recovery material, rotation generations), Cognitum Seed (stable identity and derivation lineage under Seed Vault custody), and Secret Relay (encrypted delivery bound to identity/target/purpose/lease/nonce/expiration, blocking replay and cross-target reuse), executing as one PostgreSQL/RuVector-authorized lifecycle in the specified runtime order.

*Verification:* A secret request traverses Engine→Broker→Mint/Vault→Relay→target with full audit capture

### T042 · §5 · Bootstrap security schemas and encrypted secret custody

Bootstrap must initialize the security schemas, import protected secret bytes into encrypted custody, establish identities and trust roots, enroll providers and devices, provision Seed Vault records, register Cognitum lineage, and record every bootstrap byte and event.

*Verification:* Security schemas populated; secret bytes in encrypted custody with bootstrap audit records

### T043 · §5 · Implement rotation and revocation with proven cutover

Rotation advances the protected version or derivation epoch, updates dependent grants, retires earlier authority, and proves cutover; revocation invalidates grants and leases, blocks relay, records affected executions, and starts remediation.

*Verification:* Rotate a secret and verify old authority retired with cutover proof; revoke and verify relay blocked

### T044 · §5 · Enforce plaintext exposure boundaries

PostgreSQL/RuVector retains protected encrypted secret bytes plus complete custody/policy/identity/issuance/transport/use/rotation/revocation/audit history; plaintext is exposed only to the exact authorized target for the exact lease lifetime; root plaintext never enters redb caches, UI projections, ordinary logs, command output, or general model context.

*Verification:* Scan redb, logs, UI state, and model context for absence of root plaintext

### T058 · RV§2 · Build envctl workspace binaries

Build the envctl workspace (agent-env, engine, cli, gui, secrets-engine, secrets-proto, secretd, secretctl, secrets-store-libsql) producing bins envctl, envctl-gui, secretd, and secretctl with redb 4.1 and RuVector feature bundles.

*Verification:* four bins build; envctl --version reports 0.1.0

### T121 · RV§13 · Implement envctl four coupled paths

(1) Discovery/ingress: files/host state become Nushell tables, validated envctl rows, original byte objects, semantic records, and CodeDB transactions with originals immutable; (2) database synchronization: read/write canonical lifeos_coord.envctl_table and envctl_row generations under task, branch, identity, policy, lease, with local tables carrying database generation and witness identifiers; (3) projection/materialization; (4) security/activation via Secret Engine, Broker, Mint, Seed Vault, Cognitum Seed, Relay with atomic symlink activation and Yazelix/Zellij session-preserving reload, every effect returning to the database.

*Verification:* envctl_row generations round-trip with witness identifiers; symlink activation preserves live Zellij session

### T122 · RV§13 · Generate all materialized configs with provenance markers

Database-selected rows generate bootstrap.nu, bootstrap.sh, Codex config fragments, MCP config, Yazelix settings, RTK config, GitKB references, meta manifests, runner environment, Rust/Fenix/Kache/wild environment, CUDA/NVIDIA environment, and database environment. Each generated object contains generator revision, source table/generation, checksum, timestamp, branch, witness, and do-not-edit marker.

*Verification:* Every generated file header carries generator revision, source generation, checksum, and do-not-edit marker

### T123 · RV§13 · Build envctl with ruvector feature bundles

Enable the `ruvector` feature (ruvector-core/graph/ruvllm/RVF integration), `ruvector-pg` (PostgreSQL extension client with pg17), and `ruvector-cuda` (fused/CUDA inference) as authorized; envctl's redb 4.1 events, migrations, evidence, checkpoints, rollback, and sessions reconcile completely to PostgreSQL/RuVector.

*Verification:* envctl builds with these features; redb event log fully reconciled into PG

### T137 · RV§16 · Lock down function grants to envctl commit capability

REVOKE EXECUTE from PUBLIC on all functions in every lifeos schema; ingest_event is revoked from lifeos_runtime and granted only to lifeos_envctl; store_bytes/load_object_bytes granted to envctl/runtime/worker/release; reader gets SELECT-only; ALTER DEFAULT PRIVILEGES revoke PUBLIC on functions/tables/sequences for lifeos_migrator.

*Verification:* Attempted ingest_event as lifeos_runtime fails; succeeds only as lifeos_envctl

### T164 · REL · Implement atomic activation with exact rollback

After database approval, envctl performs the atomic symlink flip and Yazelix/Zellij session-preserving reload; the prior activation remains an exact rollback target.

*Verification:* activation flip test; rollback-target restoration; session-preserving reload check

### T174 · R10 · Withhold production PG-write credentials from CodeDB

codedb_store_pg is a direct PG store creating a possible bypass of envctl exclusivity; withhold production PG-write credentials from plugin/agent roles and limit the direct store to explicit bootstrap/parity/read/repair/migration grants.

*Verification:* database role/grant audit; negative direct-write test

### T175 · R11 · Implement envctl drain/embed/commit worker

envctl (rev 48368a97) lacks the complete drain/embed/PG loop; worker implementation is a release gate. envctl orchestrates the approved ruvllm/Candle embedding executor and exclusively invokes the CodeDB PG mapping; ONNX/ort is separately gated outside the default closure.

*Verification:* idempotent drain/embed/commit/restart tests; vector provenance; capability-denial; crash/replay

### T181 · DOC · Implement files-to-tables-to-generated-files conversion

The permanent environment conversion is `files → Nushell tables → validated envctl tables → generated files`; after cutover each canonical table generation is a PostgreSQL row set surfaced through envctl; generated files are replaceable projections and originals remain evidence.

*Verification:* envctl table checksums and generated-file checksums verified at the runner gate

### T184 · DOC · Stamp provenance on all generated outputs

Generated `bootstrap.nu`, `bootstrap.sh`, and Codex/MCP/Yazelix/RTK/GitKB/meta/runner/Rust/Fenix/Kache/wild/CUDA/NVIDIA/database outputs carry generator, source table, table checksum, timestamp, branch, witness, and do-not-edit provenance.

*Verification:* inspect generated files for complete provenance headers

### T187 · DOC · Generate Yazelix configuration from database rows

Yazelix supplies the Nix-owned runtime (Nushell, Zellij, Yazi, Helix/Neovim, popups, widgets, Codex terminal workflow); envctl generates its controlled configuration from database rows.

*Verification:* clean shell/login; session-preserving reload; config provenance check

### T191 · INV07 · Enforce envctl-only commit capability in the database

Database capabilities must prevent plugin or agent bypass of envctl as the sole authoritative PostgreSQL/RuVector ingress committer, table operator, embedding orchestrator, security boundary, materializer, projection manager, and activation interface.

*Verification:* role/grant audit; negative direct-write tests from plugin/agent roles

### T192 · INV08 · Implement the six-subsystem secret lifecycle

Secret Engine, Secret Broker, Secret Mint, Seed Vault, Cognitum Seed, and Secret Relay must preserve protected bytes, constrained plaintext exposure, full lifecycle (issuance/renewal/rotation/revocation), and complete audit.

*Verification:* allow/deny, expiry, rotation, revocation, replay, cross-target, audit-chain, root-plaintext-exclusion tests

