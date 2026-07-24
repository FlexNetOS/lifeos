---
slug: tasks/blueprint-byte-capture-reconciliation
title: "Byte-capture and reconciliation contract (RV§19, §2)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`byte-capture-reconciliation` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Gate bootstrap completion on zero-undeclared-loss reconstruction (§1.1)
- Implement PTY emergency spool for backpressure (§3.3)
- Verify distribution planes converge on shared state (RV§2)
- Import 137 additional Cargo manifest directories (RV§2)
- Import AgentDB definitions with verified object counts (RV§7)
- Store complete .rvf containers with projections and receipts (RV§7)
- Capture every inference and embedding byte-complete (RV§8)
- Capture complete build exhaust before acknowledgement (RV§15)
- Freeze and import all repositories (step 1) (RV§17)
- Implement capture-before-transform with full identifiers (RV§19)
- Capture commands, files, and models to full fidelity (RV§19)
- Commit atomically; record every state change as event (RV§19)
- Restrict compaction to acknowledged projections (RV§19)
- Enforce zero-undeclared-loss operation completion (REL)
- Enforce pre-transform byte tee and lineage (R12)
- Close the return loop for every physical effect (INV14)

## Acceptance Criteria

- [ ] Gate bootstrap completion on zero-undeclared-loss reconstruction — verified by: Run reconstruction of imported host state and diff against source; zero undeclared loss
- [ ] Implement PTY emergency spool for backpressure — verified by: Induce owner outage during interactive PTY; verify spool capture, replay, and post-commit removal
- [ ] Verify distribution planes converge on shared state — verified by: cross-plane schema/digest comparison test
- [ ] Import 137 additional Cargo manifest directories — verified by: manifest-directory count audit against the enumerated list
- [ ] Import AgentDB definitions with verified object counts — verified by: object-count audit matches 16/34/4/3 and 8/21/2/5
- [ ] Store complete .rvf containers with projections and receipts — verified by: export/reimport digest-equality receipt exists per container
- [ ] Capture every inference and embedding byte-complete — verified by: a stored inference row replays deterministically from captured state
- [ ] Capture complete build exhaust before acknowledgement — verified by: Build task ack exists only where full exhaust rows exist in lifeos_release/lifeos_blob
- [ ] Freeze and import all repositories (step 1) — verified by: Bootstrap capture ledger contains commit/tree/lockfile bytes per pinned repo
- [ ] Implement capture-before-transform with full identifiers — verified by: Raw object row precedes any derived record for the same event; identifiers complete
- [ ] Capture commands, files, and models to full fidelity — verified by: Sampled command/file/model records contain every contracted field
- [ ] Commit atomically; record every state change as event — verified by: No UPDATE-in-place on event fields; transform and import/export receipts complete
- [ ] Restrict compaction to acknowledged projections — verified by: Compaction refuses unacknowledged projections; canonical rows never deleted
- [ ] Enforce zero-undeclared-loss operation completion — verified by: byte/semantic/provenance/effect equality gates; reconstruction of files/repos/crates/binaries/RVF containers from database state
- [ ] Enforce pre-transform byte tee and lineage — verified by: byte-equality corpus for success, failure, signal, binary, partial-line, interleaved streams
- [ ] Close the return loop for every physical effect — verified by: D12 round-trip fixture: commit identity plus witness precede acknowledgement

## Context

- **Execution order:** 1 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-rtk-rtk-nu-envelope]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-data-schema]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-envctl-committer-security]], [[tasks/blueprint-redb-state-plane]], [[tasks/blueprint-codedb-ingress]], [[tasks/blueprint-ruvllm-agentdb-rvf]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T002, T023, T048, T051, T094, T096, T103, T128, T140, T155, T156, T157, T158, T162, T176, T197 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- Cross-cutting: capture-before-transform governs every other component; its gates run at steps 1, 8, and 14–15.

## Obligations (full detail)

### T002 · §1.1 · Gate bootstrap completion on zero-undeclared-loss reconstruction

Bootstrap completes only when PostgreSQL/RuVector governs operational execution and can reconstruct the imported host state with zero undeclared loss.

*Verification:* Run reconstruction of imported host state and diff against source; zero undeclared loss

### T023 · §3.3 · Implement PTY emergency spool for backpressure

Backpressure never discards PTY or process frames: controlled task delivery pauses where safe; an already interactive PTY uses an fsynced, sequential, content-addressed emergency spool registered to its session/lease, replays it into the recovered owner, and cannot receive a completion acknowledgement until every spooled byte is reconciled; the spool is removed only after PostgreSQL commit/witness acknowledgement.

*Verification:* Induce owner outage during interactive PTY; verify spool capture, replay, and post-commit removal

### T048 · RV§2 · Verify distribution planes converge on shared state

The Rust, NAPI/WASM/TypeScript, and PostgreSQL distribution planes must converge on the same PostgreSQL/RuVector schemas, byte identities, RVF records, and witness chains.

*Verification:* cross-plane schema/digest comparison test

### T051 · RV§2 · Import 137 additional Cargo manifest directories

Beyond root members, 137 tracked Cargo manifest directories complete the inventory (agentic-robotics 6, other crates 17, RuVix 12, RVF 25, RVM 17, support/test/patch 4, other examples 15, data 5, exo-ai-2025 21, ruvLLM examples 3, vibecast-7sense 12); each is independently addressable in the component table and part of byte-complete build, test, provenance, and release capture.

*Verification:* manifest-directory count audit against the enumerated list

### T094 · RV§7 · Import AgentDB definitions with verified object counts

Import AgentDB source indexes, triggers, views, row bytes, change history, and .rvf serialization into the canonical PostgreSQL schemas; the native memory schema contributes 16 tables, 34 indexes, 4 triggers, 3 views and the causal/learning frontier 8 tables, 21 indexes, 2 triggers, 5 views; every definition and row maps into canonical migrations with authority object, tenant, branch, generation, execution, provenance, and witness identifiers.

*Verification:* object-count audit matches 16/34/4/3 and 8/21/2/5

### T096 · RV§7 · Store complete .rvf containers with projections and receipts

For each RVF container store the complete .rvf file as chunked bytea with SHA-256 and SHAKE256 identities; header, manifest, generation, parent generation, segment directory, offsets, lengths, checksums, alignment, compression/quantization metadata; every segment's original bytes plus decoded relational/vector/graph/model/adapter/branch/witness/signature projections; signatures, signers, trust chain, import/export execution, device, tool revision, policy, verification result; and round-trip reconstruction receipts proving exported .rvf bytes equal the selected generation.

*Verification:* export/reimport digest-equality receipt exists per container

### T103 · RV§8 · Capture every inference and embedding byte-complete

Store for every inference the exact prompt/message bytes, system/tool context, retrieved byte ranges, tokenized input, tokenizer/model/weight digest, quantization, adapter and SONA generation, FastGRNN route, AgentDB/RVF generation, random seed, sampling parameters, attention/cache configuration, device/driver/kernel identity, input/output tensors, output token stream, decoded bytes, tool calls, costs, timing, errors, and witness linkage; local embedding generation follows the same capture contract.

*Verification:* a stored inference row replays deterministically from captured state

### T128 · RV§15 · Capture complete build exhaust before acknowledgement

Every command's argv, environment, cwd, source digest, lockfile bytes, compiler/runtime versions, stdout, stderr, exit code, artifact bytes, Nix derivation/output paths, device inventory, and witness must return through CodeDB/envctl into PostgreSQL/RuVector before the build task is acknowledged.

*Verification:* Build task ack exists only where full exhaust rows exist in lifeos_release/lifeos_blob

### T140 · RV§17 · Freeze and import all repositories (step 1)

Freeze every repository at the revision table; import commit, tree, submodule, LFS, mode, xattr, lockfile, and source bytes into the bootstrap capture ledger.

*Verification:* Bootstrap capture ledger contains commit/tree/lockfile bytes per pinned repo

### T155 · RV§19 · Implement capture-before-transform with full identifiers

Capture begins before parsing, normalization, compression, summarization, token reduction, embedding, quantization, execution, or display; every raw event receives tenant, session, request, hop, branch, sequence, identity, time, environment, and idempotency identifiers; original bytes stored inline or as ordered non-overlapping chunks; zero-length objects are explicit records; streams use ordered frames retaining framing/timing; typed forms (MessagePack, JSON, Nuon, rows, ASTs, symbols, embeddings, vectors, graphs, tokens, summaries) are separate linked objects.

*Verification:* Raw object row precedes any derived record for the same event; identifiers complete

### T156 · RV§19 · Capture commands, files, and models to full fidelity

Commands store executable, per-argument byte objects, cwd, complete environment projection, stdin/stdout/stderr, binary descriptors, signals, exit code, duration, filesystem/network/device effects, and toolchain identity. Files store path bytes, filename encoding, content, mode, owner, ACL, xattrs, timestamps, symlink target, sparse ranges, hard-link identity, tree position, repository object, and materialization generation. Models store weights, tokenizer, configuration, adapters, SONA state, every cache byte, inputs, outputs, routes, device/kernel/driver identity, and performance records.

*Verification:* Sampled command/file/model records contain every contracted field

### T157 · RV§19 · Commit atomically; record every state change as event

The PostgreSQL transaction commits byte objects, domain rows, outbox events, and witness linkage atomically; consumers acknowledge only the committed identity. Every queue claim, retry, lease renewal, partial output, crash, denial, conflict, and rollback is an event rather than an overwritten field. Each transform records exact input object/range, code/tool revision, parameters, environment, random seed, output object, error, resource use, and witness. Each import/export proves tree/object/byte/mode/symlink/metadata/semantic/graph/record equivalence with differences as explicit transformation records.

*Verification:* No UPDATE-in-place on event fields; transform and import/export receipts complete

### T158 · RV§19 · Restrict compaction to acknowledged projections

redb stores the live logical record and application WAL while PostgreSQL stores the complete reconciled representation and commit linkage; cache eviction changes local presence only after durable capture. Secret plaintext stays inside its exact authorized target and lease and never leaks into broad capture surfaces. Lifecycle policy compacts or removes only acknowledged external and local projections; canonical PostgreSQL bytes, protected secret bytes, histories, lineage, custody records, and witnesses remain durably present and reconstructable.

*Verification:* Compaction refuses unacknowledged projections; canonical rows never deleted

### T162 · REL · Enforce zero-undeclared-loss operation completion

An operation completes only when source bytes/records are captured, identity/semantics/history/provenance preserved, each transformation links exact inputs and outputs, all tool/model/device/security/release evidence returns, and byte-level plus semantic verification proves zero undeclared loss.

*Verification:* byte/semantic/provenance/effect equality gates; reconstruction of files/repos/crates/binaries/RVF containers from database state

### T176 · R12 · Enforce pre-transform byte tee and lineage

Derived views are lossy unless the tee precedes all transforms and preserves stream order; require immutable objects/frame order, digests, parser/filter revisions, exit/signal/timing records, and durable raw↔derived linkage.

*Verification:* byte-equality corpus for success, failure, signal, binary, partial-line, interleaved streams

### T197 · INV14 · Close the return loop for every physical effect

Every physical effect and result completes the return loop; completion requires PostgreSQL commit identity and witness before final UI acknowledgement.

*Verification:* D12 round-trip fixture: commit identity plus witness precede acknowledgement

