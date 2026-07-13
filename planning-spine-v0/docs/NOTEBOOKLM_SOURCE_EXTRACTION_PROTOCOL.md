---
id: lifeos.planning-spine.notebooklm-source-extraction-protocol
title: NotebookLM Source Extraction Protocol
description: Fail-closed provenance, claim normalization, evidence, task mapping, and proof rules for NotebookLM material.
type: protocol
status: active
lifecycle: maintained
created: 2026-07-10
updated: 2026-07-12
aliases:
  - NotebookLM extraction protocol
  - NotebookLM provenance protocol
tags:
  - lifeos
  - notebooklm
  - provenance
  - verification
related:
  - "[[planning-spine-v0/navigation/README]]"
  - "[[planning-spine-v0/1.0_VISION/Notebooklm/README]]"
  - "[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]"
---

# NotebookLM Source Extraction Protocol

## Rule

Process exactly one NotebookLM object at a time. Do not begin the next object
until the current object is captured, mapped, verified, and proof-recorded.

## Composite export landing

A composite export or data-table bundle may be preserved before exact
NotebookLM object identity is available, but it is not a captured source object:

1. preserve the raw bytes without frontmatter, reformatting, or line-ending
   normalization;
2. catalog the digest, byte/newline counts, type, known provenance, and identity
   gaps in a maintained sidecar;
3. link a maintained compatibility review that separates desired architecture
   from current implementation truth;
4. do not add the composite to the source registry, promote claims, or close a
   task until the normal identity/atomization/proof loop below is complete.

The current LifeOS architecture bundle is cataloged at
[`1.0_VISION/Notebooklm/README.md`](../1.0_VISION/Notebooklm/README.md) ·
[[planning-spine-v0/1.0_VISION/Notebooklm/README]], with interpretation in
[`ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md`](../1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) ·
[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]].

## Loop

1. **Resolve identity**
   - Record notebook ID and exact object ID.
   - Record whether the object is an original source, report, data table, mind
     map, note, or other artifact.
   - Never call an artifact an original source.
2. **Extract**
   - Retrieve or download the complete indexed content.
   - Record byte count, line count, and SHA-256.
3. **Atomize**
   - Split the content into independently testable claims.
   - Preserve the section and exact technical terminology.
4. **Classify**
   - `engine-fact`: a claim about a library or storage engine.
   - `application-claim`: behavior supplied by code around the engine.
   - `architecture-proposal`: desired system relationship or data flow.
   - `current-implementation-claim`: assertion that code already behaves so.
   - `performance-claim`: latency, throughput, SIMD, or scale assertion.
   - `comparison-claim`: claim distinguishing two components.
5. **Cross-reference**
   - Map each claim to one or more canonical LifeOS task IDs.
   - Search prior generated peer task tables for duplicate or contradictory
     work before adding a new task.
6. **Expose gaps**
   - A report-only claim is not accepted as fact.
   - Record required source inspection, benchmark, runtime proof, or owner
     decision in the mapped task.
7. **Update**
   - Update the claim table, source registry, conflict table, task graph,
     architecture depth, current gaps, and North Star coverage where needed.
8. **Verify**
   - Claim count equals mapped-claim count.
   - Every mapped task exists.
   - Every unresolved claim has an explicit resolution path.
   - Task graph normalizes with zero errors.
   - Ready count remains zero while global execution is closed.
   - `bun run planning-spine:verify` and `git diff --check` pass.
9. **Prove**
   - Write a proof record with artifact identity, checksum, claim counts,
     mapping checks, unresolved count, commands, and archive receipt.
   - Merge the proof append-only into the proof ledger.
10. **Advance**
    - Only after steps 1-9 pass may the registry mark the object `captured`.
    - Then and only then may the next object be selected.

## Claim Verification

Source extraction and claim verification are separate loops.

### Execution roles and loop

The verification team repeats this loop for one task-graph row at a time:

```text
research -> surface -> plan -> red test -> implement -> green test
         -> update task graph and proof ledger -> repeat
```

- **Sol** owns deep reasoning, conflict resolution, task ordering, and final
  proof integration.
- **Terra** owns bounded implementation work after the red test exists.
- **Luna** owns high-volume claim routing and classification.
- **OpenRouter `tencent/hy3:free`** is the external research lane. Every issue
  or conflict discovered in the loop is sent to that lane for deeper research.
  HY3 participation is recorded only when a live authenticated generation
  receipt identifies the exact model and response. Configuration, catalog
  presence, an attempted request, or another model's summary is not
  participation.

If the HY3 route cannot authenticate or generate, record the exact blocker and
keep any HY3-dependent research gate open. Never silently substitute another
model.

### Real Bun installation requirement

Node-package capability evidence counts only from the real repository-owned
installation:

- `package.json` owns every directly imported verification package at an exact
  version.
- `bun.lock` owns the complete resolved graph.
- profile-owned `bun` and `bunx` are the only package-manager frontdoors:
  `npm = bun` and `npx = bunx`.
- `bun install --frozen-lockfile` must reproduce the install.
- package entrypoints must resolve under this repository's `node_modules`.
- lifecycle scripts remain blocked until their exact contents are inspected;
  any approved package is recorded in `trustedDependencies`.
- receipts preserve the Bun executable, Bun version, repository root,
  `package.json` and `bun.lock` hashes, direct package versions, compatible
  transitive runtime versions, and loaded native/WASM backend.

Temporary directories, generated package manifests, renamed lockfiles,
`bun add --cwd` probes, `bunx` package downloads, and ambient/global
`node_modules` may support research, but they do not verify installed LifeOS
behavior and cannot close a claim.

### TDD and task order

1. Select the earliest unresolved verification row whose parents are complete.
2. Add a failing test that expresses the row's verification gate.
3. Capture the red result.
4. Implement the smallest repo-owned setup or evidence collector that can make
   the test pass.
5. Run the targeted green test, then the complete required gate.
6. Record issues and conflicts and send them to HY3 research.
7. Append a proof revision and regenerate the task graph before selecting the
   next row.

1. Every unresolved claim is inserted into
   `generated/notebooklm_claim_verification_queue.source.csv`.
2. Later NotebookLM objects may `support`, `contradict`, `qualify`, or
   `duplicate` the claim. Repetition does not verify it.
3. Native capability claims are verified from the current local dependency
   source and tests first, then official upstream source if local evidence is
   insufficient.
4. Current-implementation claims are verified through local source call paths,
   tests, commits, PRs, and runtime evidence.
5. Performance claims require a reproducible local benchmark with workload,
   hardware, configuration, and percentile results.
6. Architecture proposals require technical evidence followed by the explicit
   owner decision represented in the task graph.
7. Web research is allowed only for one stable claim at a time, only when local
   primary evidence is insufficient, and only from primary upstream sources.
   Record URL, version or commit, retrieval time, content hash, exact pointer,
   and relationship in `generated/notebooklm_claim_evidence.source.csv`.
8. Do not run broad or parallel web synthesis while extracting a NotebookLM
   source. It blends provenance and is forbidden.
9. A claim closes only as `verified`, `qualified`, `refuted`, or
   `owner-decided`, with a proof URI. Otherwise it remains queued.
