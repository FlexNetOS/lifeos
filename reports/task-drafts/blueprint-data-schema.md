---
slug: tasks/blueprint-data-schema
title: "Canonical data schema, migrations 0001–0016, RLS and guards (RV§16)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`data-schema` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Store raw bytes beside every derived representation (§2;INV10)
- Bind full identity tuple on every path and hop (§3.2)
- Create canonical runtime tables via migrations (RV§3)
- Create ruvector database, extensions schema, and roles (RV§16)
- Create ten lifeos schemas and full table catalog (RV§16)
- Apply canonical-envelope catalog migration (RV§16)
- Enforce immutability, RLS, and guard triggers (RV§16)
- Implement runtime/security context binding (RV§16)
- Implement stored procedures and workers (RV§16)
- Execute the 16 ordered migrations with capture (RV§16)
- Configure backup, replication, and reconstruction drills (RV§16)
- Apply authorization_context rename in migration SQL (R16)

## Acceptance Criteria

- [ ] Store raw bytes beside every derived representation — verified by: Sample derived records and verify linked original raw bytes are retrievable byte-exact
- [ ] Bind full identity tuple on every path and hop — verified by: Trace one request end-to-end and verify all bound identities present
- [ ] Create canonical runtime tables via migrations — verified by: migrations apply cleanly and the canonical tables exist
- [ ] Create ruvector database, extensions schema, and roles — verified by: Extension-location DO-block passes; all nine roles exist with correct RLS/replication attributes
- [ ] Create ten lifeos schemas and full table catalog — verified by: All cataloged relations exist; chunk-set gap/length invariant enforced by verify_object
- [ ] Apply canonical-envelope catalog migration — verified by: Canonical tables carry typed_payload+raw_object_id with rewrite-prevention triggers installed
- [ ] Enforce immutability, RLS, and guard triggers — verified by: UPDATE/DELETE on guarded tables rejected; cross-tenant reads return zero rows under runtime roles
- [ ] Implement runtime/security context binding — verified by: Unbound session cannot pass RLS; plaintext absent from general columns and logs
- [ ] Implement stored procedures and workers — verified by: Each function callable under its granted role and enforces its documented gate
- [ ] Execute the 16 ordered migrations with capture — verified by: SHAKE256 test vector passes pre-migration; lifeos_ops.migration rows exist for 0001–0016 with digests
- [ ] Configure backup, replication, and reconstruction drills — verified by: Restore drill receipt shows byte-hash and count equality at chosen LSN
- [ ] Apply authorization_context rename in migration SQL — verified by: PostgreSQL grammar parse passes all six blocks (51, 103, 19, 6, 6, 100 statements); dollar-tag checks

## Context

- **Execution order:** 5 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-byte-capture-reconciliation]], [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-cow-branching]], [[tasks/blueprint-envctl-committer-security]], [[tasks/blueprint-redb-state-plane]], [[tasks/blueprint-codedb-ingress]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T004, T018, T064, T130, T131, T132, T133, T135, T136, T138, T139, T179 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- R16 records the `authorization` → `authorization_context` reserved-word fix as already applied to the migration SQL; re-verify the fix is present before running migrations.

## Obligations (full detail)

### T004 · §2;INV10 · Store raw bytes beside every derived representation

The host ALL-data contract requires storing every repository, byte, semantic record, metadata, task, model I/O, and secret-audit record; SHA-256/SHAKE256 digests, manifests, pointers, indexes, vectors, graphs, and provenance locate and verify bytes but never substitute for them; chunked/compressed/quantized/summarized forms are linked while originals remain durably present.

*Verification:* Sample derived records and verify linked original raw bytes are retrievable byte-exact

### T018 · §3.2 · Bind full identity tuple on every path and hop

Every path binds tenant, identity, session, request, execution, task, branch, lease, local sequence, raw object/frame identities, typed-record identity, parser/filter revision, timestamps, exit status, idempotency key, PostgreSQL commit identity, and witness; every hop records delivery, acknowledgement, retry, and error state.

*Verification:* Trace one request end-to-end and verify all bound identities present

### T064 · RV§3 · Create canonical runtime tables via migrations

Project-owned canonical runtime tables are created by the migrations defined in subsection 16, built around the extension rather than inside it.

*Verification:* migrations apply cleanly and the canonical tables exist

### T130 · RV§16 · Create ruvector database, extensions schema, and roles

Database is named `ruvector`; install extensions ruvector, pgcrypto, btree_gin in schema `extensions` with a guard raising if any lands elsewhere; create roles lifeos_migrator (BYPASSRLS), lifeos_security_owner (BYPASSRLS), lifeos_runtime, lifeos_envctl, lifeos_reader, lifeos_worker, lifeos_security_broker, lifeos_release (all NOBYPASSRLS), lifeos_backup (REPLICATION) with pg_read_all_data/settings grants; UUID identities database-generated, monotonic sequences, timestamptz, WAL LSN commit binding.

*Verification:* Extension-location DO-block passes; all nine roles exist with correct RLS/replication attributes

### T131 · RV§16 · Create ten lifeos schemas and full table catalog

Create schemas lifeos_blob, lifeos_semantic, lifeos_runtime, lifeos_agent, lifeos_agentdb, lifeos_rvf, lifeos_security, lifeos_coord, lifeos_release, lifeos_ops owned by lifeos_migrator, with all tables of the §16.1 catalog (blob: import_session/object/object_chunk/tree_entry/host_path/xattr/symlink/capture_event; semantic: document/ast_node/token/symbol/symbol_ref/type_record/function_record/dependency_edge/embedding/lexical_document/graph_node/graph_edge/causal_edge/transform/index_generation; runtime: session/request/request_hop/task/task_dependency/queue/lease/execution/effect/result/log_frame/error/projection/branch/branch_overlay/merge_conflict/merge_gate/promotion/inbox/outbox/reconcile_commit; agent, agentdb, rvf, security, coord, release, ops tables as cataloged). Stored objects must have inline bytes or a gap-free chunk set totaling byte_length.

*Verification:* All cataloged relations exist; chunk-set gap/length invariant enforced by verify_object

### T132 · RV§16 · Apply canonical-envelope catalog migration

Materialize every remaining catalog name via lifeos_ops.create_canonical_table with lossless typed_payload JSONB envelope and immutable raw_object_id linkage, deterministic ordering and idempotency, JSONB/traversal/record-digest/branch-sequence indexes, lifeos_ops.prevent_canonical_link_rewrite triggers, and tenant isolation across every application schema; domain migrations may promote hot envelope fields to columns without discarding either representation.

*Verification:* Canonical tables carry typed_payload+raw_object_id with rewrite-prevention triggers installed

### T133 · RV§16 · Enforce immutability, RLS, and guard triggers

Install: RVF append-only prevent_rewrite triggers; blob prevent_object_rewrite/prevent_chunk_rewrite and enforce_object_integrity; tenant RLS policies (tenant_id = lifeos_security.current_tenant()) on all application tables plus explicit policies for object_chunk, lexical_document, request_hop, branch_overlay, witness_entry, object_observation; envelope-digest guard; tenant-reference guard triggers; embedding projection dimension trigger and append-only embedding triggers; witness_entry append-only; log_frame writer guard; execution-completion, branch-head-witness, secret-lease-grant, and release-activation guard triggers.

*Verification:* UPDATE/DELETE on guarded tables rejected; cross-tenant reads return zero rows under runtime roles

### T135 · RV§16 · Implement runtime/security context binding

Implement lifeos_security.backend_binding, current_binding(), current_tenant(), bind_runtime_context(), and bootstrap_envctl_context() so every session operates under a bound tenant/identity context; secure secret storage via secret_object/secret_version/secret_lease with envelope encryption, key-version references, role separation, audited decryption, and zero plaintext logging.

*Verification:* Unbound session cannot pass RLS; plaintext absent from general columns and logs

### T136 · RV§16 · Implement stored procedures and workers

Implement lifeos_runtime.ingest_event(raw,typed,context) (stores original+typed objects, appends request/hop/capture rows, writes outbox, returns durable identity), lifeos_blob.verify_object/store_bytes/store_generated_object/load_object_bytes/canonical_jsonb_bytes, lifeos_semantic.enqueue_refresh/refresh_object, lifeos_agent.append_witness (locks chain head, verifies previous digest, advances atomically), lifeos_runtime.claim_task (FOR UPDATE SKIP LOCKED, policy/dependency gates, returns execution lease), complete_execution, create_branch/merge_branch/resolve_conflict/promote_branch (serializable + advisory locks), lifeos_security.authorize_secret/mint_secret/relay_secret/rotate_secret/revoke_secret, lifeos_release.promote (checks build/test/byte/graph/causal/security/model/forecast/witness/reconstruction gates before envctl activation), append_log_frame, and lifeos_rvf.assert_container/deferred_container_guard.

*Verification:* Each function callable under its granted role and enforces its documented gate

### T138 · RV§16 · Execute the 16 ordered migrations with capture

Run migrations 0001_extensions_roles through 0016_cutover in one authenticated session with SET ROLE/RESET ROLE boundaries and dependency order (0003 semantic/request primitives before 0004 branch/witness before 0005 security before 0006 runtime execution; deferred cross-domain constraints only after both relations and tenant identities exist). Store each migration's exact bytes, tool revision, checksums, inputs, output catalog digest, logs, and witness. The Nix gate calls extensions.digest(...,'shake256') against a fixed test vector before migrations run.

*Verification:* SHAKE256 test vector passes pre-migration; lifeos_ops.migration rows exist for 0001–0016 with digests

### T139 · RV§16 · Configure backup, replication, and reconstruction drills

Configure WAL archiving, streaming replicas, checksummed base backups, and scheduled PITR restore drills. A reconstruction drill restores a selected LSN, verifies extension/schema versions, rebuilds every file/tree/repository/RVF/model/configuration/release projection, compares byte hashes and semantic/graph counts, replays redb reconciliation, and records the complete receipt. Replica reads honor branch/generation consistency; only the primary issues promotion and activation decisions.

*Verification:* Restore drill receipt shows byte-hash and count equality at chosen LSN

### T179 · R16 · Apply authorization_context rename in migration SQL

PostgreSQL 17 grammar rejected the unquoted reserved column `authorization` in `lifeos_runtime.request` and both `ingest_event` definitions, blocking every later schema and release gate; column renamed to `authorization_context` with both insert-column lists updated while retaining the JSON envelope key `authorization`.

*Verification:* PostgreSQL grammar parse passes all six blocks (51, 103, 19, 6, 6, 100 statements); dollar-tag checks

