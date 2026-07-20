---
id: lifeos.vision.architecture-blueprint-compatibility
title: Architecture Blueprint Compatibility — CodeDB Foundation Review
description: Evidence-backed cross-reference between the NotebookLM architecture blueprint and the 2026-07-12 CodeDB change set.
type: architecture-cross-reference
status: verified-with-gaps
lifecycle: active
created: 2026-07-12
updated: 2026-07-20
review:
  implementation_repository: FlexNetOS/nu_plugin
  baseline_commit: d7cc4d830a5f8c1c51ac6850062b7066b5bbb9d2
  reviewed_head: c84740532ded2a27ee283ea7a3a5f303eaeb61a7
  reviewed_branch: agent/codedb-ci-hermetic-runtime
source_artifact:
  path: 1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md
  sha256: 014bbebb8afceee7f8deea236ed3b9425b61be3840fba47aee7c131f77268827
  bytes: 70753
  lines: 707
gitkb:
  command: git-kb
  installed_version: 0.2.12
  profile_owner: lifeos-foundation-yzx
  release_url: https://github.com/gitkb/gitkb-releases/releases/tag/v0.2.12
  current_branch_index_symbols: 0
  index_write_performed: false
truth_order:
  - checked source and executable tests
  - proof records and exact receipts
  - normalized planning-spine claims
  - architecture blueprint
aliases:
  - Blueprint compatibility
  - CodeDB foundation compatibility
tags:
  - lifeos
  - architecture
  - codedb
  - nu-plugin
  - notebooklm
  - source-provenance
  - agent-navigation
related:
  - "[[planning-spine-v0/README]]"
  - "[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_TASK_COVERAGE]]"
  - "[[planning-spine-v0/1.0_VISION/FOUNDATION_ECOSYSTEM_MAP]]"
  - "[[planning-spine-v0/1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL]]"
  - "[[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]]"
---

# Architecture Blueprint Compatibility — CodeDB Foundation Review

## 2026-07-20 expanded-anchor reconciliation

The original 707-line NotebookLM blueprint review below remains historical
current-state analysis. It is now supplemented—not overwritten—by two immutable
owner-named target-architecture anchors:

| Anchor | SHA-256 | Bytes | Lines | Role |
|---|---|---:|---:|---|
| [Fully Expanded RuVector Blueprint](./Architecture_Anchors/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md) | `c54063110be8bebb07469cbc0f76fecab142cd636e98950a36a3ee02b766a62c` | 974321 | 6340 | Complete desired execution, schema, security, recovery, and cutover scope |
| [Anchored Pipeline Graph](./Architecture_Anchors/Architecture_Data_Pipeline_Graph_ANCHORED_VERIFIED.md) | `abd36f1c2bd9d62e4fdb522e5290d93d4e7017b1b478c13dbf0a5da939c5b663` | 34773 | 560 | Corrected physical topology, owners, paths, return edges, and invariants |

The [receipt](./Architecture_Anchors/receipts.json) fixes exact file identity;
the [section inventory](./Architecture_Anchors/section_inventory.json) hashes
contiguous ranges covering every line. The
[conflict ledger](./Architecture_Anchors/anchor_conflict_ledger.csv) records 12
resolved contradictions with both sides and controlling authority. The
[claim/task crosswalk](./Architecture_Anchors/anchor_claim_task_crosswalk.csv)
maps 16 requirement groups to implementation state, proof, and stable tasks.

Controlling reconciliation:

- PostgreSQL + RuVector owns all durable LifeOS product bytes and macro-state;
  original bytes remain beside derivatives.
- redb is a single-owner transient/pass-through tier. The owner publishes a
  separate atomic checksummed read-only mmap generation and ordered UDS events;
  clients never map or open the database file.
- AgentDB owns per-agent cognition only.
- envctl is the exclusive production PostgreSQL commit and controlled return-
  projection bridge; that complete loop is a target, not current proof.
- CodeDB plus the missing `rtk_nu` adapter owns byte-complete typed ingress.
- Protected encrypted secret bytes and custody history are durable in
  PostgreSQL; plaintext is lease-bound to an exact target and excluded from
  redb, logs, UI, model context, proof, and Git.
- After proof-gated cutover, repository/task/context/refactor/format/
  consolidation/upgrade/multi-merge work is PostgreSQL-controlled, while Git,
  Meta, GitKB, ICM, editors, terminals, devices, models, and runners remain
  governed physical executors or projections whose effects return to the DB.
- The anchor's Svelte wording does not override the current Vue 3 + Tauri 2
  owner contract; the Glass/Engine behavior is implemented in Vue/Tauri.

These are ratified target assignments, not completion claims. The missing
runtime and proof are tracked by `ARCHBP-038..048`.

## Verdict

The session is **on course for the CodeDB foundation scope**, with explicit
corrections. The reviewed changes materially advance exact source capture,
backend-neutral storage, trusted online Node dependency replay, isolated
materialization, compiler-observed evidence, rollback safety, and hermetic
runtime proof. They do **not** prove the blueprint's RuVector semantic layer,
AgentDB/`.rvf` cognition, ruvllm execution, ATAS/ESN forecasting, MinCut,
witness-chain enforcement, UDS control plane, or universal static-musl release.

This distinction is intentional: the blueprint is architecture input. Checked
source, tests, receipts, and normalized claim verification remain the
implementation authority.

## Review boundary

| Item | Reviewed value |
|---|---|
| Blueprint | [Architecture Blueprint - LifeOS Core Foundation](<./Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md>) |
| Blueprint digest | `014bbebb8afceee7f8deea236ed3b9425b61be3840fba47aee7c131f77268827` |
| Implementation repo | [`FlexNetOS/nu_plugin`](../../../nu_plugin/) |
| Commit range | `d7cc4d830a5f8c1c51ac6850062b7066b5bbb9d2..c84740532ded2a27ee283ea7a3a5f303eaeb61a7` |
| Source-alignment contract | [CodeDB integration contracts](../../../nu_plugin/docs/INTEGRATION_CONTRACTS.md) |
| Round-trip contract | [CodeDB round-trip proof](../../../nu_plugin/docs/ROUND_TRIP_PROOF.md) |
| Release contract | [CodeDB release gate](../../../nu_plugin/docs/RELEASE_GATE.md) |
| Normalized source evidence | [`NBSOURCE-003`](../generated/notebooklm_source_extracts/NBSOURCE-003-nushell-redb-postgresql.md), [`NBSOURCE-029`](../generated/notebooklm_source_extracts/NBSOURCE-029-npm-rust-development-speed.md), [`NBSOURCE-030`](../generated/notebooklm_source_extracts/NBSOURCE-030-three-pillars-code-ingestion.md), [`NBSOURCE-031`](../generated/notebooklm_source_extracts/NBSOURCE-031-envctl-projection-engine.md), [`NBSOURCE-032`](../generated/notebooklm_source_extracts/NBSOURCE-032-yazelix-nushell-native-plugin.md) |
| Claim-verification receipt | [`NBVERIFY-030-032`](../proof_records/NBVERIFY-030-032.proof.json) |

Status vocabulary used below:

- **Proven-aligned** — implemented and backed by checked tests or receipts.
- **Partial-aligned** — the reviewed foundation supports the direction, but the
  end-to-end blueprint capability is not implemented or proven.
- **Corrected** — the architectural intent remains useful, but the blueprint's
  mechanism or current-state wording is inaccurate.
- **Planned/unproven** — no implementation proof exists in the reviewed range.
- **Conflict** — following the blueprint literally would violate a current
  authority, safety, or data-integrity contract.

## Compatibility matrix

| Blueprint area | Reviewed implementation | Status | Agent interpretation |
|---|---|---|---|
| redb plus PostgreSQL tiering | CodeDB preserves source bytes and symlink metadata through backend-neutral redb and PostgreSQL stores with parity coverage. | **Proven-aligned** for exact storage; **partial-aligned** for the larger tiered-memory design | redb is currently an exact durable store, not a proven vector geometry engine. PostgreSQL parity does not imply a live RuVector semantic adapter. |
| Three-pillar ingestion | Whole-tree capture, content-addressed blobs, source provenance, build artifacts, and compiler observations are implemented. | **Partial-aligned** | Exact ingestion is real. Nushell AST-to-redb-to-envctl-embedding-to-PostgreSQL synchronization is not established end to end. |
| Latest online Node source | The fresh Bun dependency tree, package aliases, native package, lock state, and exact source blobs are captured and checksum bound. | **Proven-aligned after correction** | “NPM first” is not authority by itself. Exact repository/package identity, lock data, version, native binary, and digest receipts provide authority. |
| napi-rs native chain | Checked source establishes Rust `cdylib` → napi-rs → platform `.node` package → `@ruvector/core` wrapper → Bun → CodeDB. | **Corrected** | Do not describe this verified chain as a C++ implementation. Generated bindings are release output; the engine authority remains checked Rust source plus exact package receipts. |
| Native Nushell plugin | The plugin remains Rust-native and uses the Nushell plugin protocol's MessagePack serializer. | **Proven-aligned** for protocol shape; **partial-aligned** for performance claims | MessagePack use is real. “Zero-copy,” “instant vectorization,” and `.rvf` writes require separate runtime and benchmark proof. |
| envctl bridge | CodeDB exports bounded rows, checksums, and materialized paths; envctl is an external, commit-pinned consumer. | **Corrected / partial-aligned** | envctl must not read redb or PostgreSQL internals or silently become CodeDB's storage owner. The blueprint's automatic semantic synchronization claim remains unproven. |
| Database-hosted code edits | CodeDB uses source-snapshot-bound plans, explicit operator decisions, isolated patch artifacts, drift detection, and recovery rows. | **Conflict** for direct SQL `UPDATE`; **proven-aligned** for isolation intent | Never translate the blueprint's direct-row editing example into unapproved mutation. All edits remain plan-, approval-, isolation-, and proof-gated. |
| Projection/materialization | Exact files, permissions, binaries, `OUT_DIR` artifacts, and safe relative symlinks can be reproduced into isolated targets. | **Proven-aligned** for CodeDB replay; **planned/unproven** for the claimed envctl PostgreSQL projection engine | CodeDB replay is not evidence that envctl can reconstruct a production branch from semantic rows. |
| Copy-on-write and rollback | No-replace descriptor-relative publication, identity-bound rollback, concurrent replacement preservation, isolated temp roots, and source-drift refusal are implemented. | **Proven-aligned** at the filesystem/artifact layer | This is a concrete safety substrate for future COW workflows, not proof of database-native AgentDB or RuVector branching. |
| Integrity and anti-bluffing | Schema-4 receipts bind repository, tree, commands, artifacts, external sources, output hashes, and clean-state guards; public release adds detached attestation. | **Partial-aligned** | Cryptographic provenance is real. RuVector MinCut, SHAKE256 source-vector witness chains, GNN causal rejection, and “mathematically impossible” bluff prevention are not proven by these receipts. |
| Compiler-observed truth | Approved capture records build/proc-macro execution, `OUT_DIR`, native links, expansion/hygiene, HIR, MIR, and rustdoc through a request-bound broker. | **Proven-aligned** and strengthens the blueprint | Compiler evidence is a stronger current truth boundary than inferred semantic claims. Trusted first-party source still requires explicit dynamic-execution approval. |
| Hermetic runtime | Bubblewrap is mandatory on Linux proof runners, unprivileged namespaces are tested, nightly Rust is Nix-pinned, and runtime tools resolve from Nix outputs. | **Proven-aligned** for the proof cell; **partial-aligned** for distribution | The current runtime is reproducible through Nix-store ownership. Universal static-musl, no-Nix-store operation across the full stack remains a release target, not a current fact. |
| ruvllm, AgentDB, `.rvf`, SONA, FastGRNN | No reviewed commit implements or proves these layers. | **Planned/unproven** | Keep console/cartridge, adapter hot-swap, active learning, and 50+ agent claims in the research/architecture layer. |
| ATAS, ESN, temporal attractors, RuvLTRA | No reviewed commit implements or benchmarks predictive timelines or proportional routing. | **Planned/unproven** | Do not use forecast language as a completion gate until a checked runtime, dataset, benchmark, and failure model exist. |
| RuVector MinCut and causal GNN guardrails | No reviewed commit connects these mechanisms to CodeDB mutation or release authorization. | **Planned/unproven** | Proof-ledger and approval gates remain the actual enforcement plane. |
| LifeOS/Yazelix UDS or shared-redb control | No reviewed commit proves the proposed control path. | **Planned/unproven** | Preserve as an interface option; do not infer a live transport or shared-store ownership model. |
| GitKB/meta coordination | GitKB is available from the Yazelix/Nix profile, but the current LifeOS branch has no populated code index and no `[repos]` configuration. | **Partial-aligned** | GitKB is the durable decision/navigation plane, not source-code or release authority. Index state must be checked before relying on symbol/call results. |

## Authoritative corrections to the blueprint

1. **Source authority is exact and layered.** Trusted organizational ownership
   removes the hostile-supply-chain assumption; it does not remove the need to
   identify the exact repository, commit/tree, package/lock state, native
   artifact, and digest. Online Node sources are valid when those identities are
   captured. A blanket Crates.io fallback is not a safe substitute for the
   latest organization-owned source.

2. **napi-rs does not make the verified engine C++.** The checked path is a Rust
   `cdylib` exposed through napi-rs as a native `.node` package. Treat “C++
   extension” in `NBSOURCE-029` and the blueprint as superseded wording.

3. **redb is storage authority, not an embedding model.** The current CodeDB
   implementation stores exact bytes, metadata, snapshots, plans, and receipts.
   Vector generation, similarity math, GNNs, and semantic indexing are derived
   layers that require their own adapters and proof.

4. **Direct database mutation is forbidden.** The blueprint's illustrative SQL
   `UPDATE` conflicts with the implemented plan/approval/materialize/verify
   chain. Semantic discovery may propose a change; it may not bypass the apply
   gate.

5. **envctl consumes a contract.** It may consume exported rows, checksums,
   environment facts, and materialized paths. It must not couple to CodeDB store
   internals or take ownership by implication.

6. **Nix ownership is the current reproducibility proof.** Static musl or
   closure bundling may later improve distribution, but the reviewed changes
   prove pinned Nix outputs and sandbox execution, not universal Nix-store
   independence.

7. **Absolute guarantees remain hypotheses until proven.** “Mathematically
   impossible,” “absolute stability,” fixed microsecond/millisecond latency,
   sub-millisecond hot-swap, 50+ agents, and subpolynomial dynamic isolation are
   not accepted completion claims without checked primary implementation,
   reproducible benchmarks, and failure-case tests.

## Recent change map

| Commit | Compatibility effect |
|---|---|
| `07c52c0` — PR #22 | Added an honest owner-authorized local-release provenance lane, compiler-observed broker evidence, PostgreSQL parity evidence, and a fail-closed release boundary. |
| `149b321` — PR #23 | Closed trusted-source replay: exact online Node dependency capture, native-chain proof, symlink-aware round trip, backend parity, full proof inventory, and NotebookLM alignment contracts. |
| `3869040` — PR #24 | Bound rollback to publication descriptors and identities, preventing an ABA-style concurrent replacement from being removed. |
| `c774119` — PR #25 | Provisioned Bubblewrap as a mandatory pinned proof-runner dependency. |
| `096d577` — PR #26 | Added an explicit hosted-runner user-namespace preflight and a real Bubblewrap execution probe. |
| `d643b09` — PR #27 | Pinned the compiler-proof nightly Rust toolchain through the Nix flake and removed ambient-toolchain dependence. |
| `c847405` | Resolved runtime tools from the Nix output itself and regression-locked the requirement-ledger command. |

## GitKB navigation and index contract

Verified locally on 2026-07-12:

| Check | Result |
|---|---|
| Front door | `/nix/store/66llanvj1g9qbcvbj8c674jc595ri2rr-lifeos-foundation-yzx/toolbin/git-kb` |
| Resolved binary | `/nix/store/g7lf0fnjxm22ijnvwcx38c7drkql4wnn-git-kb-0.2.12/bin/git-kb` |
| Installed version | `git-kb 0.2.12` |
| Published release | [gitkb/gitkb-releases v0.2.12](https://github.com/gitkb/gitkb-releases/releases/tag/v0.2.12) |
| Current branch code index | `0` symbols, `0` files |
| Repository discovery | no `[repos]` section; `git-kb repo list --json` returned `[]` |
| Read-only index dry run | `156` symbols from `351` files; `1,464` call sites; `138` imports |

The code index extracts symbols from executable source; Markdown produced zero
code symbols in the dry run. Therefore:

- use Markdown links and wiki links for planning-document navigation;
- use `git-kb code` for scripts, Rust, TypeScript, and other supported source;
- do not claim current call-graph coverage until the relevant branch/worktree is
  indexed; and
- ingest/commit planning documents into the GitKB knowledge store separately if
  full-text KB search is required. That is a distinct write operation.

Safe inspection commands:

```bash
command -v git-kb
readlink -f "$(command -v git-kb)"
git-kb --version
git-kb doctor --json
git-kb code stats --json
git-kb code doctor --json
git-kb code index planning-spine-v0 --dry-run --index-only \
  --branch planning-spine-nbstated-2026-07-12
```

Index writes, after explicit approval:

```bash
git-kb code index planning-spine-v0 --index-only \
  --branch planning-spine-nbstated-2026-07-12
git-kb code index ../nu_plugin --index-only --worktree ../nu_plugin
git-kb code doctor --json
git-kb code stats --json
```

## Five-minute agent route

1. Read the repository contract: [`AGENTS.md`](../../AGENTS.md).
2. Read the package entrypoint: [`planning-spine-v0/README.md`](../README.md).
3. Use this document to separate proof from architectural intent:
   [[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]].
4. Open [[planning-spine-v0/1.0_VISION/FOUNDATION_ECOSYSTEM_MAP]] for built/planned ownership and
   [[planning-spine-v0/1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL]] for portability boundaries.
5. Read the raw blueprint only for original context:
   [[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]].
6. Follow normalized claims to their proof records before changing status.
7. Inspect CodeDB's [integration contracts](../../../nu_plugin/docs/INTEGRATION_CONTRACTS.md),
   [round-trip proof](../../../nu_plugin/docs/ROUND_TRIP_PROOF.md), and
   [release gate](../../../nu_plugin/docs/RELEASE_GATE.md) before modifying the
   ingestion, replay, source-authority, or release path.

## Remaining proof gaps

The current course is compatible, but the following subjects remain open:

- live RuVector semantic/embedding adapter for CodeDB — `ARCHBP-003`;
- end-to-end Nushell → CodeDB → envctl → PostgreSQL/RuVector synchronization —
  `ARCHBP-001` through `ARCHBP-003`;
- database-hosted semantic edit plans that still preserve CodeDB approval and
  materialization gates — `ARCHBP-004` through `ARCHBP-006`;
- envctl production-branch projection from database rows — `ARCHBP-006`;
- AgentDB/`.rvf` and ruvllm runtime integration — `ARCHBP-007` and
  `ARCHBP-008`;
- SONA/FastGRNN, ATAS/ESN/RuvLTRA, MinCut, witness-chain, and causal-GNN
  enforcement — `ARCHBP-009` through `ARCHBP-017`;
- LifeOS/Yazelix UDS or shared-store ownership contract — `ARCHBP-018`;
- full-stack static-musl or bundled-closure portability proof —
  `YZXCONV-021` and `ARCHBP-021`;
- a populated, branch-current GitKB code index and explicit repository config —
  `ARCHBP-022`;
- an exact-clean-tree public release receipt with detached attestation whenever
  public release readiness is claimed — `ARCHBP-025`.

The complete heading-by-heading mapping, authoritative corrections, and related
foundation gaps are maintained in
[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_TASK_COVERAGE]].

## Refresh protocol

Update this cross-reference when the blueprint changes, the reviewed CodeDB
head changes, or a previously unproven layer gains executable proof:

1. recompute the blueprint SHA-256, byte count, and line count;
2. record the new baseline/head commit range;
3. inspect every commit and changed source/test/contract file in the range;
4. update the compatibility matrix without promoting proposals from wording
   alone;
5. run the planning-spine verifier and Git diff checks; and
6. refresh GitKB health/index receipts before relying on code-intelligence
   results.
