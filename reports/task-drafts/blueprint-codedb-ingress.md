---
slug: tasks/blueprint-codedb-ingress
title: "nu_plugin / CodeDB byte-complete ingress and ingest-envelope (§3.4, RV§14, R08–R09)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`codedb-ingress` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Record bootstrap as database import sessions (§1.1)
- Wire native Nushell ingestion bypassing rtk (§3.2)
- Verify and canonicalize raw objects in CodeDB (§3.4)
- Implement codedb ingest-envelope plugin command (§3.4)
- Build CodeDB workspace binaries (RV§2)
- Implement CodeDB BlobStore with PG/redb parity (RV§14)
- Wire the live typed ingress route (RV§14)
- Implement codedb ingest-envelope and prove commit isolation (step 7) (RV§17)
- Enforce Nu-parse-before-plugin ordering (R08)
- Implement codedb ingest-envelope typed command (R09)

## Acceptance Criteria

- [ ] Record bootstrap as database import sessions — verified by: Verify import sessions exist in DB covering bootstrap from first byte; TBD query
- [ ] Wire native Nushell ingestion bypassing rtk — verified by: Native Nu value ingested with type fidelity preserved; no rtk hop
- [ ] Verify and canonicalize raw objects in CodeDB — verified by: Ingest duplicate payloads; verify dedup, digest check, and receipt with raw_object_id
- [ ] Implement codedb ingest-envelope plugin command — verified by: `rtk_nu --format jsonl -- <cmd> | from json --objects | codedb ingest-envelope` returns typed receipt
- [ ] Build CodeDB workspace binaries — verified by: three bins build and nu_plugin_codedb registers with Nu 0.113.1
- [ ] Implement CodeDB BlobStore with PG/redb parity — verified by: Redb/PostgreSQL parity: identical hashes, metadata, paths, modes, symlinks, BOMs, and binary reconstruction
- [ ] Wire the live typed ingress route — verified by: Typed round trip through nu_plugin_codedb returns the committed identity with raw-object linkage
- [ ] Implement codedb ingest-envelope and prove commit isolation (step 7) — verified by: Parity suite passes; write attempt from plugin role denied; envctl commit succeeds
- [ ] Enforce Nu-parse-before-plugin ordering — verified by: isolated registration, protocol trace, native bypass, typed/raw linkage tests
- [ ] Implement codedb ingest-envelope typed command — verified by: command inventory/signature test; JSON, JSONL, Nuon, native-Nu end-to-end fixtures; raw-link; PG denial

## Context

- **Execution order:** 7 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-rtk-rtk-nu-envelope]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-redb-state-plane]], [[tasks/blueprint-envctl-committer-security]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T001, T014, T027, T028, T057, T124, T125, T146, T172, T173 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- VERIFY-FIRST: completed task `tasks/yzx-iso/t4-7-byte-complete` claims byte-complete verification; R17 addendum records `codedb ingest-envelope` implemented at nu_plugin @931d48f (schema codedb.ingest-envelope.v0) with the release gate NOT narrowed, and R19 flags R08 unverified against that revision. Independent audit first.

## Obligations (full detail)

### T001 · §1.1 · Record bootstrap as database import sessions

The ordered bootstrap (Nix, envctl, Nu, CodeDB, importers, migration utilities) must be recorded as PostgreSQL/RuVector import sessions from its first byte, capturing raw bytes with complete structure, semantics, metadata, history, identity, ownership, timestamps, transformations, and provenance.

*Verification:* Verify import sessions exist in DB covering bootstrap from first byte; TBD query

### T014 · §3.2 · Wire native Nushell ingestion bypassing rtk

Path: native Nu command/value → typed Nu pipeline → required `codedb ingest-envelope` child command → redb owner. Native typed values bypass rtk and rtk_nu because a text compressor would lose type fidelity.

*Verification:* Native Nu value ingested with type fidelity preserved; no rtk hop

### T027 · §3.4 · Verify and canonicalize raw objects in CodeDB

CodeDB decodes each envelope payload, verifies length and digest, stores or deduplicates the exact bytes, assigns the canonical `raw_object_id`, and returns that identity in the typed receipt before accepting the typed/compact linkage; compact or typed representations supplement but never replace raw objects.

*Verification:* Ingest duplicate payloads; verify dedup, digest check, and receipt with raw_object_id

### T028 · §3.4 · Implement codedb ingest-envelope plugin command

The pinned CodeDB plugin registers only scan/capture/materialize/import/query commands with Nothing inputs; `codedb ingest-envelope` with typed record/list/table input and a typed receipt output is an explicit release-blocking addition. After implementation, Nushell invokes the plugin child which validates the envelope, links raw objects, and persists through the redb-owner client contract. Nu 0.113.1 typed boundaries are `from json --objects`, `from json`, `from nuon`.

*Verification:* `rtk_nu --format jsonl -- <cmd> | from json --objects | codedb ingest-envelope` returns typed receipt

### T057 · RV§2 · Build CodeDB workspace binaries

Build the nu_plugin/CodeDB workspace (codedb, codedb-cargo, codedb-context, codedb-core, codedb-fixtures, codedb-build-capture, codedb-mcp, codedb-rust-static, codedb-store-redb, codedb-store-pg, nu_plugin_codedb) producing bins codedb, codedb-mcp, and nu_plugin_codedb against Nu 0.113.1 with redb/PostgreSQL stores.

*Verification:* three bins build and nu_plugin_codedb registers with Nu 0.113.1

### T124 · RV§14 · Implement CodeDB BlobStore with PG/redb parity

The CodeDB BlobStore contract has PostgreSQL and redb implementations with differential round-trip behavior; it imports complete directory trees, file bytes, binaries, BOMs, symlinks, modes, paths, ownership metadata, source identity, checksums, and provenance; Cargo/static analysis and build capture add crates, workspaces, feature resolution, rustc/cargo messages, ASTs, symbols, types, dependencies, diagnostics, artifacts, and command exhaust.

*Verification:* Redb/PostgreSQL parity: identical hashes, metadata, paths, modes, symlinks, BOMs, and binary reconstruction

### T125 · RV§14 · Wire the live typed ingress route

Implement: immutable raw object/frame refs + Nu value + typed table + identity + provenance → Nushell 0.113.1 invokes nu_plugin_codedb → MessagePack plugin frames → CodeDB core and build/static/context enrichers → flexnetos-redb-owner client protocol → redb 4.1 transaction/event → envctl validation/authorization/ordered reconciliation → codedb-store-pg mapping over postgres/rustls → PostgreSQL byte objects + relational rows + RuVector projections → typed query result through the same plugin process. codedb, codedb-mcp, and nu_plugin_codedb share object identities; rtk adds compact views; rtk_nu supplies the byte-first envelope with raw-object linkage; original logs/blobs stay attached.

*Verification:* Typed round trip through nu_plugin_codedb returns the committed identity with raw-object linkage

### T146 · RV§17 · Implement codedb ingest-envelope and prove commit isolation (step 7)

Implement the missing typed `codedb ingest-envelope` pipeline command and redb-owner client backend; build CodeDB/nu_plugin with redb and PostgreSQL stores; run blob-store parity; register nu_plugin_codedb through isolated Nushell configuration; prove Nu/MessagePack typed round trip, raw-byte object linkage, and `from json --objects`/`from json`/`from nuon` conversion paths. Prove plugin/agent roles cannot perform authoritative PostgreSQL writes and envctl alone holds production commit capability.

*Verification:* Parity suite passes; write attempt from plugin role denied; envctl commit succeeds

### T172 · R08 · Enforce Nu-parse-before-plugin ordering

Insert `from json --objects`, `from json`, or `from nuon` before the nu_plugin_codedb child; native Nu bypasses RTK; MessagePack (MsgPackSerializer) is plugin protocol transport only, never described as redb encoding. R19 flags R08 unverified against nu_plugin @931d48f.

*Verification:* isolated registration, protocol trace, native bypass, typed/raw linkage tests

### T173 · R09 · Implement codedb ingest-envelope typed command

Registered plugin commands use `Nothing` input with no ingest-envelope; the required `codedb ingest-envelope` typed input/receipt command and owner-client backend are release blockers. R17: implemented at nu_plugin @931d48f (crates/codedb/src/ingest.rs, schema codedb.ingest-envelope.v0, tagged ARCHBP-001); invariant 16 gate not narrowed.

*Verification:* command inventory/signature test; JSON, JSONL, Nuon, native-Nu end-to-end fixtures; raw-link; PG denial

