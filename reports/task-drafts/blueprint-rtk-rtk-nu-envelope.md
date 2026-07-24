---
slug: tasks/blueprint-rtk-rtk-nu-envelope
title: "rtk / rtk_nu byte-exact tee and versioned envelope (§3.4, R06–R07)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`rtk-rtk-nu-envelope` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Wire legacy-output ingestion pipeline (§3.2)
- Implement, package, pin, and witness rtk_nu (§3.4)
- Implement the versioned lossless envelope schema (§3.4)
- Enforce rtk_nu role boundaries (§4.4)
- Build rtk_nu raw-byte adapter (RV§2)
- Prove rtk/rtk_nu tee contract; build ICM and weave (step 10) (RV§17)
- Restrict rtk to compaction and analytics (R06)
- Build, package, and pin rtk_nu adapter (R07)
- Keep RTK scoped with telemetry off and raw tee attached (DOC)
- Pin rtk_nu before accepting it as implemented (INV16)

## Acceptance Criteria

- [ ] Wire legacy-output ingestion pipeline — verified by: Run a legacy command through the pipeline; raw bytes and compact view both persisted with linkage
- [ ] Implement, package, pin, and witness rtk_nu — verified by: rtk_nu binary exists, is pinned, and is witnessed; activation blocked until then
- [ ] Implement the versioned lossless envelope schema — verified by: Round-trip binary/invalid-UTF-8 output through the envelope and verify byte-exact recovery
- [ ] Enforce rtk_nu role boundaries — verified by: Code review/tests confirm rtk_nu never calls the plugin or emits Nu values
- [ ] Build rtk_nu raw-byte adapter — verified by: rtk_nu binary builds and satisfies the §3.4 raw-byte envelope contract
- [ ] Prove rtk/rtk_nu tee contract; build ICM and weave (step 10) — verified by: Tee test shows raw frames digest-linked before compact view; weave fenced attempt receipts stored
- [ ] Restrict rtk to compaction and analytics — verified by: filter fixtures, failure tee, raw/compact linkage, binary-input tests; prove no universal JSON/Nuon claim
- [ ] Build, package, and pin rtk_nu adapter — verified by: package/revision/schema pin; binary, invalid-UTF-8, interleave, signal, parse-failure suite; raw equality; native-Nu bypass
- [ ] Keep RTK scoped with telemetry off and raw tee attached — verified by: verify telemetry disabled; raw tee attachment on failures
- [ ] Pin rtk_nu before accepting it as implemented — verified by: exact package/revision, schema closure, and witness pin executed at the release gate

## Context

- **Execution order:** 2 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-byte-capture-reconciliation]], [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-data-schema]], [[tasks/blueprint-redb-state-plane]], [[tasks/blueprint-codedb-ingress]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T013, T025, T026, T033, T049, T149, T170, T171, T186, T198 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- VERIFY-FIRST: meta-root task `tasks/architecture-rtk-nu-adapter` is marked completed, and review-ledger addendum R18 records an implementation at rtk-tokenkill `src/rtk_nu_main.rs` (envelope `flexnetos.rtk_nu.envelope.v1`). Per operational invariant 16 the gate is NOT narrowed: rtk_nu is not 'implemented' until exact revision, schema, package closure, and witness are pinned. Independently audit the claimed implementation before building on it.

## Obligations (full detail)

### T013 · §3.2 · Wire legacy-output ingestion pipeline

Path: legacy command → rtk_nu byte-exact stdout/stderr/binary tee → lossless raw frames/digests plus rtk compact view → versioned JSONL/JSON/Nuon envelope → Nushell parser → typed Nu values → required `codedb ingest-envelope` child command → redb owner. Neither rtk nor rtk_nu calls the plugin directly; CodeDB verifies bytes and resolves/creates canonical raw-object IDs, persisting both raw and derived objects.

*Verification:* Run a legacy command through the pipeline; raw bytes and compact view both persisted with linkage

### T025 · §3.4 · Implement, package, pin, and witness rtk_nu

The pinned rtk-tokenkill source provides only `rtk`; no `components/rtk_nu` exists in the pinned meta tree. `rtk_nu` is a required FlexNetOS adapter to implement, package, pin, and witness before activation — it tees byte-exact process streams and emits the versioned envelope.

*Verification:* rtk_nu binary exists, is pinned, and is witnessed; activation blocked until then

### T026 · §3.4 · Implement the versioned lossless envelope schema

The rtk_nu JSONL/JSON/Nuon envelope must include schema version; tenant/identity/grant/lease/session/request/execution/task/branch IDs; exact argv and cwd; selected-environment digest; ordered stdout/stderr/binary frame IDs; stream name, byte offset/length, lossless base64 payload, provisional frame/content identity, digest; exit status/signal/timing; rtk filter and revision; compact representation; parser name/revision/status/error; typed payload; idempotency key; and provenance/witness seed. JSONL chunks large streams without changing frame order. The tee occurs before any decoding, compression, normalization, truncation, or parsing; invalid UTF-8, binary, partial lines, parse failures, stderr interleaving, and nonzero exits retain original bytes and ordering.

*Verification:* Round-trip binary/invalid-UTF-8 output through the envelope and verify byte-exact recovery

### T033 · §4.4 · Enforce rtk_nu role boundaries

rtk_nu tees byte-exact process streams, invokes or consumes rtk as configured, and emits the versioned envelope for Nushell to parse; it never emits a native Nu value by itself, never invokes nu_plugin_codedb directly, and never handles an already-typed native Nu pipeline; raw frames and parse failures always accompany normalized representations.

*Verification:* Code review/tests confirm rtk_nu never calls the plugin or emits Nu values

### T049 · RV§2 · Build rtk_nu raw-byte adapter

rtk 0.43.0 at pinned fork develop revision 44cf84e7 contains no rtk_nu binary, and the meta repo has no components/rtk_nu implementation; rtk_nu is the required, separately packaged raw-byte tee and JSONL/Nuon adapter defined by §3.4 and is a release-blocking FlexNetOS addition.

*Verification:* rtk_nu binary builds and satisfies the §3.4 raw-byte envelope contract

### T149 · RV§17 · Prove rtk/rtk_nu tee contract; build ICM and weave (step 10)

Build rtk from the pinned develop revision and the newly implemented separately pinned rtk_nu; prove raw-before-transform teeing, binary/invalid-UTF-8 framing, JSONL/Nuon parsing, native-Nu bypass, and failure preservation. Build ICM on the canonical PostgreSQL/RuVector schema; build weave and prove fenced message/job receipts.

*Verification:* Tee test shows raw frames digest-linked before compact view; weave fenced attempt receipts stored

### T170 · R06 · Restrict rtk to compaction and analytics

rtk (0.43.0, develop 44cf84e7) provides command-specific compact text filters and analytics, not universal JSON/Nuon/Nu translation; the pre-transform tee and structured envelope belong to the required rtk_nu.

*Verification:* filter fixtures, failure tee, raw/compact linkage, binary-input tests; prove no universal JSON/Nuon claim

### T171 · R07 · Build, package, and pin rtk_nu adapter

rtk_nu existed nowhere on 2026-07-19; it is a new required separately packaged Rust/Nix adapter emitting versioned JSONL/JSON/Nuon envelopes with lossless base64 frames, digests, and ordering; activation blocked until exact repo/package/Nix-lock/schema pin and witness. R18: now implemented as rtk-tokenkill `src/rtk_nu_main.rs` (envelope flexnetos.rtk_nu.envelope.v1, crates rtk_nu and rtk_nu_test_fixture); invariant 16 gate not narrowed.

*Verification:* package/revision/schema pin; binary, invalid-UTF-8, interleave, signal, parse-failure suite; raw equality; native-Nu bypass

### T186 · DOC · Keep RTK scoped with telemetry off and raw tee attached

RTK remains project/session scoped with telemetry off; compact summaries preserve cost while raw failure tee logs and original output remain attached; failures diagnosed from raw records.

*Verification:* verify telemetry disabled; raw tee attachment on failures

### T198 · INV16 · Pin rtk_nu before accepting it as implemented

rtk_nu cannot be treated as implemented until its exact revision, schema, package closure, and witness are pinned — this gate governs the R17/R18 implementation acknowledgements at release.

*Verification:* exact package/revision, schema closure, and witness pin executed at the release gate

