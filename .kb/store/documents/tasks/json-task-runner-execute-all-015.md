---
id: 019fa367-2db1-73c3-b262-e3ded1bbb1c3
slug: tasks/json-task-runner-execute-all-015
title: "Execute every canonical JSON task packet to completion"
type: task
status: active
priority: critical
tags: [json-task-runner, planning-spine, execution, no-drift]
---

## Objective

Resume the existing immutable `json_task_runner` graph and execute every canonical JSON packet through the runner. Honor dependencies and declared sequential/bounded-parallel scheduling. The owner's 2026-07-27 instruction is digest-bound human approval for every packet and all local blocker remediation under `/home/flexnetos/meta`.

## Constraints

- Use the existing runner; do not redesign it or generate substitute prompts.
- Preserve all existing/dirty work.
- Create only valid digest-bound approval, checkpoint, lease, receipt, and proof records.
- Diagnose and fix local failures, then retry/resume the same immutable graph.
- No destructive loss, secret exposure, push, deploy, or unrelated external mutation.

## Active immutable run

- Run ID: `20260727T033323851132Z-b4e24d277985`
- Graph SHA-256: `c1191ba7886c0a1ac8e854b54601dc7772c29d1653645636c107e3472e2efb6c`
- Packet count: 198
- Coordinators are serialized; no duplicate runner is active while current-HEAD proof generation runs.

## Progress and blocker repairs

- Runner regression suite now passes 26/26. Fixes include meta-repo path resolution, nested `codex exec` recursion guard, dependency-consistent receipt status, refusal/failure narrative detection, model routing, and narrative/executable classification.
- REQ-053 symbol-index parser coverage and REQ-059 full workspace tests were repaired for same-graph retry.
- CDB030-CDB069 were actively executed/reviewed. Recent verified nodes cover runtime packaging, Nu protocol degradation, isolated plugin registration, bridge provenance, no-real-HOME mutation, enabled/disabled Yazelix launch, secret guards, redb lifecycle, bounded CLI/MCP output, envctl runtime, truth sealing, and final validation.
- `nu_plugin` whole-branch work was committed without fragmentation. Strict Clippy blocker CDB046 was fixed at `8b36916`; truth surface was resealed at `579f720`; CDB070 worker finalized evidence and resealed manifests at clean HEAD `61c538b726f2c0c400871767e7d4d2af20379a72`.
- Full offline Rust workspace tests, deny-warnings Clippy, 112 isolated Python validator tests, 21-file Nu syntax, task-graph structure, direct evidence, truth-surface checks over 817 tracked files, checksum verification, and diff hygiene pass.
- An isolated sibling worktree set uses exact pins for `nu_plugin`, `envctl`, `loop_lib`, and `meta_plugin_protocol`, preserving dirty live peers.
- A private Unix-socket PostgreSQL 17.10 test cluster supplies CDB086. PostgreSQL parity, redb parity, fail-closed, and MCP integration proofs pass without production credentials or network ingress.
- A complete 140-row provider-local receipt was generated and independently validated for HEAD `579f720`; the CDB070 worker then legitimately advanced HEAD to `61c538b`, so a new all-140 receipt is currently executing for that exact commit.
- EF-008's command exited 0 but was falsely classified as refusal because its locally complete report used `pass_with_external_blocker` for unavailable authenticated Google Drive mutation. The report has zero local gaps; the single false-positive classifier token was removed and regression-covered. Real failed/blocked narrative detection remains.
- GitNexus reports the accumulated owner-approved branch delta as CRITICAL: 100 files, 207 symbols, and 143 execution flows versus `master`; the whole branch remains preserved and validated as one unit.

## Acceptance criteria

- [x] Existing immutable run is resumed, not replaced.
- [x] Every canonical packet is represented in the run graph.
- [ ] Every node reaches verified completion through the runner.
- [x] Local blockers fixed so far without discarding existing work.
- [ ] Final graph digest, counts, receipts, changed files, and verification evidence are recorded.