# NotebookLM Source Extraction Protocol

## Rule

Process exactly one NotebookLM object at a time. Do not begin the next object
until the current object is captured, mapped, verified, and proof-recorded.

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
