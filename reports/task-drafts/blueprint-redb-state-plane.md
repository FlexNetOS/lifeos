---
slug: tasks/blueprint-redb-state-plane
title: "flexnetos-redb-owner, mmap projection, geometry plane (§3.3, RV§12, R05)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`redb-state-plane` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Wire live Glass projection over mmap plus UDS events (§3.2)
- Build the flexnetos-redb-owner single-writer service (§3.3)
- Implement atomic mmap projection publication (§3.3)
- Implement crash recovery, replay, and reconnect protocol (§3.3)
- Benchmark sidebar freshness SLO (§3.3)
- Capture all redb state into PostgreSQL and pin versions (§4.6)
- Build flexnetos-redb-owner single-writer service (RV§12)
- Publish atomically versioned read-only mmap projection (RV§12)
- Create owner-managed redb table layout (RV§12)
- Implement in-path geometry engine (RV§12)
- Implement monotonic idempotent reconciliation and recovery (RV§12)
- Build redb owner mmap projection publisher (R05)
- Reconcile every redb byte to the canonical database (INV06)
- Forbid concurrent redb opens and sidebar HTTP (INV17)

## Acceptance Criteria

- [ ] Wire live Glass projection over mmap plus UDS events — verified by: Confirm no HTTP state server and no second writable redb opener; sidebar updates on events
- [ ] Build the flexnetos-redb-owner single-writer service — verified by: Owner service runs and ingests while LifeOS is closed; only one writable opener exists
- [ ] Implement atomic mmap projection publication — verified by: Kill mid-publish and verify readers never observe torn/unchecksummed generation; format pinned
- [ ] Implement crash recovery, replay, and reconnect protocol — verified by: Crash/kill test: no duplicate or lost records after replay with idempotency keys
- [ ] Benchmark sidebar freshness SLO — verified by: Run the freshness benchmark and record measured latency
- [ ] Capture all redb state into PostgreSQL and pin versions — verified by: redb contents reconcilable from PostgreSQL records; redb 4.1 and 2.1 pins verified
- [ ] Build flexnetos-redb-owner single-writer service — verified by: Second concurrent redb database-file open fails; owner socket authenticates and versions commands
- [ ] Publish atomically versioned read-only mmap projection — verified by: Reader validates header checksum/generation; no partial snapshot observable during publish
- [ ] Create owner-managed redb table layout — verified by: All named tables present with contracted fields
- [ ] Implement in-path geometry engine — verified by: Geometry results in redb match committed RuVector column values
- [ ] Implement monotonic idempotent reconciliation and recovery — verified by: Kill/restart owner: cursor replays exactly; duplicate commits absorbed via idempotency receipt
- [ ] Build redb owner mmap projection publisher — verified by: single-opener denial; projection-format pin; atomic flip; mapped-byte/checksum parity; stale-reader; crash/gap/replay; no-HTTP; latency-SLO tests
- [ ] Reconcile every redb byte to the canonical database — verified by: monotonic local-seq/mmap-generation/LSN reconciliation; all records queryable in PostgreSQL
- [ ] Forbid concurrent redb opens and sidebar HTTP — verified by: single-opener denial; no-HTTP check; latency-SLO tests

## Context

- **Execution order:** 6 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-envctl-committer-security]], [[tasks/blueprint-codedb-ingress]], [[tasks/blueprint-glass-engine-frontdoor]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T015, T020, T021, T022, T024, T034, T115, T116, T117, T118, T119, T169, T190, T199 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- VERIFY-FIRST: completed task `tasks/yzx-iso/t4-3-redb-plane` claims redb wiring; the blueprint's R05 says the owner/mmap publisher did not exist. Audit what actually exists before building.

## Obligations (full detail)

### T015 · §3.2 · Wire live Glass projection over mmap plus UDS events

Path: redb owner commit → atomic publish of a checksummed generation to the owner-controlled read-only mmap projection → ordered local event over an authenticated Unix-domain socket → Tauri backend → mapped generation → Svelte store/sidebar. This is local event-driven shared-state IPC — not HTTP, not PostgreSQL polling; LifeOS never opens the writable redb file.

*Verification:* Confirm no HTTP state server and no second writable redb opener; sidebar updates on events

### T020 · §3.3 · Build the flexnetos-redb-owner single-writer service

Because redb permits one writable Database opener and provides no mmap backend or cross-process notification, one supervised `flexnetos-redb-owner` local service must own the only writable handle and state file; CodeDB, envctl, and Yazelix processes are authenticated mutation/query clients over a versioned Unix-domain protocol. The owner serializes mutations, serves consistent snapshots, and emits ordered commit notifications with local_seq, transaction/table/key scope, projection generation, mmap generation, and checksum; it is lifecycle-independent of the Glass.

*Verification:* Owner service runs and ingests while LifeOS is closed; only one writable opener exists

### T021 · §3.3 · Implement atomic mmap projection publication

The owner publishes a versioned read-only memory-mapped projection region with header, schema revision, generation, local_seq, payload length, checksum, and immutable snapshot payload; it writes the next generation into an inactive region, fsyncs it, atomically flips the active-generation descriptor, and only then emits the matching ordered notification. LifeOS verifies generation/checksum before rendering. Owner service, mmap format, atomic publication algorithm, path/permissions, schema/version negotiation, stale-reader detection, and corruption fallback are required additions and activation blockers until implemented and pinned.

*Verification:* Kill mid-publish and verify readers never observe torn/unchecksummed generation; format pinned

### T022 · §3.3 · Implement crash recovery, replay, and reconnect protocol

Crash recovery runs redb ACID recovery, validates the contiguous local sequence and frame checksums, regenerates and atomically republishes the mmap projection, and resumes envctl from `reconcile_cursor`. envctl commits with a stable idempotency key, records PostgreSQL transaction/LSN/generation/witness, then acknowledges the local record — an acknowledgement never precedes the durable commit. A client reconnect compares last event and mapped generation; gap, stale generation, or checksum mismatch forces a fresh snapshot plus replay.

*Verification:* Crash/kill test: no duplicate or lost records after replay with idempotency keys

### T024 · §3.3 · Benchmark sidebar freshness SLO

Sidebar freshness is measured from owner commit through mmap publication/event wakeup to rendered Svelte state; sub-millisecond delivery is a performance SLO to benchmark, not an assumed storage guarantee.

*Verification:* Run the freshness benchmark and record measured latency

### T034 · §4.6 · Capture all redb state into PostgreSQL and pin versions

redb 4.1 is the embedded ACID boundary; one supervised owner holds the only writable Database; the integration adds the read-only mmap projection and ordered commit-event wakeup subordinate to the owner's transaction sequence. Every redb byte, mapped generation, state, cache entry, log, intermediate result, retry record, vector, and transition is captured in PostgreSQL/RuVector; RuVector's internal storage separately uses its pinned redb 2.1 and must not be conflated.

*Verification:* redb contents reconcilable from PostgreSQL records; redb 4.1 and 2.1 pins verified

### T115 · RV§12 · Build flexnetos-redb-owner single-writer service

Implement the supervised `flexnetos-redb-owner` owning the only writable redb 4.1 handle (writable opener cannot coexist with a second read-only opener) and exposing versioned authenticated Unix-domain commands. It is one logical redb live plane with one mutation authority — not a competing database or HTTP service.

*Verification:* Second concurrent redb database-file open fails; owner socket authenticates and versions commands

### T116 · RV§12 · Publish atomically versioned read-only mmap projection

The owner publishes ui_projection as an atomically versioned read-only mmap region with mmap_projection_header (magic, format/schema revision, active slot, generation, local_seq, payload length, checksum, source transaction, PostgreSQL commit identity, witness reference) and two or more immutable mmap_projection_slot regions, building/verifying/fsyncing then atomically publishing without exposing partial snapshots, emitting an ordered event per published generation.

*Verification:* Reader validates header checksum/generation; no partial snapshot observable during publish

### T117 · RV§12 · Create owner-managed redb table layout

Implement tables: ingress_frame (sequence, request/hop, raw-byte object and ordered frame refs, validated typed envelope, plugin-protocol revision, identity, time, checksum, PostgreSQL commit key), operation_wal (intended transaction, idempotency key, attempt, retry schedule, ack, exact payload), ui_projection, semantic_cache, inference_dedupe, geometry_vector, plus retry, scratchpad, session, lease_mirror, materialization, execution_frame, and reconcile_cursor.

*Verification:* All named tables present with contracted fields

### T118 · RV§12 · Implement in-path geometry engine

The geometry engine executes vector-coordinate storage, Euclidean/L2, dot product, cosine distance/similarity, normalization, centroid, temporal delta, and SIMD-ready batch operations in the integrated application path for immediate UI/routing; the same coordinates and results are committed to RuVector columns.

*Verification:* Geometry results in redb match committed RuVector column values

### T119 · RV§12 · Implement monotonic idempotent reconciliation and recovery

Owner reserves local sequence and commits the complete logical WAL record; publishes matching projection generation; envctl validates and executes the PostgreSQL transaction through the CodeDB mapping with a stable idempotency key; owner stores db transaction/LSN/generation/witness ack and republishes affected state; contiguous cursor advances; only acknowledged local projection may compact after canonical capture. Retries preserve every attempt/error; restart recovery validates contiguous sequence, rebuilds/republishes the mmap read model, replays from last acknowledged cursor, and treats a matching idempotency receipt as success.

*Verification:* Kill/restart owner: cursor replays exactly; duplicate commits absorbed via idempotency receipt

### T169 · R05 · Build redb owner mmap projection publisher

redb 4.1 removed mmap, allows one writer, and a read-only opener cannot coexist with the writable opener. Implement the required lifecycle-independent owner (`flexnetos-redb-owner`) that publishes an atomic, checksummed, read-only mmap projection plus ordered UDS wakeups; LifeOS maps only that projection; projection format must be pinned.

*Verification:* single-opener denial; projection-format pin; atomic flip; mapped-byte/checksum parity; stale-reader; crash/gap/replay; no-HTTP; latency-SLO tests

### T190 · INV06 · Reconcile every redb byte to the canonical database

redb serves buffer, scratchpad, retry, semantic cache, inference dedupe, application WAL, geometry, and SIMD roles through one supervised owner; every local byte, projection generation, and event reconciles to PostgreSQL/RuVector.

*Verification:* monotonic local-seq/mmap-generation/LSN reconciliation; all records queryable in PostgreSQL

### T199 · INV17 · Forbid concurrent redb opens and sidebar HTTP

One lifecycle-independent redb owner holds the only writable database-file handle; LifeOS maps only the published projection and never opens the file; no local HTTP server or PostgreSQL polling sits on the live sidebar path.

*Verification:* single-opener denial; no-HTTP check; latency-SLO tests

