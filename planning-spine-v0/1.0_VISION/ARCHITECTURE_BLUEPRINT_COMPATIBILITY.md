---
id: lifeos.vision.architecture-blueprint-compatibility
title: Architecture Blueprint Compatibility — CodeDB Foundation Review
description: Evidence-backed cross-reference between the NotebookLM architecture blueprint, the CodeDB change set, and the current migration-package/task-table integration.
type: architecture-cross-reference
status: reviewed-current-integration-on-course-with-open-product-gaps
lifecycle: active
created: 2026-07-12
updated: 2026-07-13
review:
  implementation_repository: FlexNetOS/nu_plugin
  baseline_commit: d7cc4d830a5f8c1c51ac6850062b7066b5bbb9d2
  reviewed_head: c84740532ded2a27ee283ea7a3a5f303eaeb61a7
  reviewed_branch: agent/codedb-ci-hermetic-runtime
  planning_spine_repository: FlexNetOS/lifeos
  planning_spine_baseline: 712272c0774564e96b7619ba5a11bd1cd346795b
  planning_spine_source_branch: planning-spine-nbstated-2026-07-12
  concurrent_snapshot_observed_at: 2026-07-13T03:54:51Z
  integration_branch: task-migration-integrated-2026-07-13
  integration_baseline: ee71a506957b92767591b19b9048840c4d530cb5
  migration_source_commit: c84740532ded2a27ee283ea7a3a5f303eaeb61a7
  reference_superset: planning-spine-v0/envctl-db-nu-plugin-migration-automation-package
source_artifact:
  path: 1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md
  sha256: 014bbebb8afceee7f8deea236ed3b9425b61be3840fba47aee7c131f77268827
  bytes: 70753
  lines: 707
gitkb:
  command: git-kb
  installed_version: 0.2.12
  profile_owner: lifeos-foundation-yzx
  code_stats_symbols: 0
  doctor_symbols: 2
  index_views_consistent: false
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
  - "[[planning-spine-v0/navigation/README]]"
  - "[[planning-spine-v0/1.0_VISION/README]]"
  - "[[planning-spine-v0/1.0_VISION/Notebooklm/README]]"
  - "[[planning-spine-v0/1.0_VISION/FOUNDATION_ECOSYSTEM_MAP]]"
  - "[[planning-spine-v0/1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL]]"
  - "[[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]]"
---

# Architecture Blueprint Compatibility — CodeDB Foundation Review

## Verdict

The reviewed `nu_plugin` session is **on course for the CodeDB foundation
scope**, with explicit corrections. Its changes materially advance exact source capture,
backend-neutral storage, trusted online Node dependency replay, isolated
materialization, compiler-observed evidence, rollback safety, and hermetic
runtime proof. They do **not** prove the blueprint's RuVector semantic layer,
AgentDB/`.rvf` cognition, ruvllm execution, ATAS/ESN forecasting, MinCut,
witness-chain enforcement, UDS control plane, or universal static-musl release.

This distinction is intentional: the blueprint is architecture input. Checked
source, tests, receipts, and normalized claim verification remain the
implementation authority.

The earlier concurrent planning-spine snapshot was **not on course as a whole**
because its `STORE-001` completion lacked the task's approval, simulation, and
evidence gates. The current integration branch is **on course**: it preserves
the raw Blueprint bytes, applies append-only proof corrections, keeps imported
migration work review-only, requires actual human approval, and exposes exact
navigation routes. It does not promote the Blueprint, copied package, source
CSV statuses, or agent-authored approvals into implementation truth.

## Review boundary

| Item | Reviewed value |
|---|---|
| Blueprint | [Architecture Blueprint - LifeOS Core Foundation](<./Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md>) |
| Blueprint digest | `014bbebb8afceee7f8deea236ed3b9425b61be3840fba47aee7c131f77268827` |
| Raw artifact catalog | [NotebookLM Artifact Catalog](./Notebooklm/README.md) and [`artifacts.meta.json`](./Notebooklm/artifacts.meta.json) |
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

## Evidence-backed corrections to the blueprint

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

6. **Nix ownership is the current reproducibility proof.** Static musl and
   closure bundling remain mandatory distribution targets, but the reviewed
   changes prove only pinned Nix outputs and sandbox execution. Universal
   Nix-store-independent distribution remains unverified.

7. **Absolute guarantees remain hypotheses until proven.** “Mathematically
   impossible,” “absolute stability,” fixed microsecond/millisecond latency,
   sub-millisecond hot-swap, 50+ agents, and subpolynomial dynamic isolation are
   not accepted completion claims without checked primary implementation,
   reproducible benchmarks, and failure-case tests.

## Concurrent planning-spine landing audit

Snapshot: `FlexNetOS/lifeos` at committed baseline `712272c`, source branch
`planning-spine-nbstated-2026-07-12`, with concurrent uncommitted changes
observed at `2026-07-13T03:54:51Z`.

| Change surface | Disposition | Evidence and required action |
|---|---|---|
| Blueprint plus three NotebookLM CSV exports | **Land with metadata** | Preserve their exact bytes. The new [catalog](./Notebooklm/README.md) and [`artifacts.meta.json`](./Notebooklm/artifacts.meta.json) bind hashes, sizes, line counts, type, and incomplete provenance. Presence proves no implementation claim. |
| Package README, vision index, compatibility review | **Land after repair** | Use portable Markdown links plus repository-root-qualified wiki links; keep desired architecture separate from implementation truth. |
| `generated/store_relationship_decision.json`, `generated/task_families/STORE-001.json`, `proof_records/STORE-001.proof.json` | **Do not land as written** | The proof claims an owner-approved decision without an approval receipt, skips the required simulation, calls the raw blueprint foundational truth, and promotes refuted or unproven mechanisms. |
| STORE task/ledger projections | **Return to undecided and regenerate** | The concurrent session changed `STORE-001` from Draft to Complete, appended proof-ledger sequence `166`, and advanced status toward `POSTGRES-002`. Restore the last valid Draft source row, remove the unsupported proof through the repository's append-only correction procedure, then regenerate raw, normalized, index, status, and ledger reports. |
| CodeDB BlobStore parity as a universal migration proof | **Reject overreach** | Parity covers CodeDB source blobs across its redb/PostgreSQL backends. It does not prove migration of LifeOS SQLite state, envctl's durable redb migration history, semantic indexes, AgentDB state, or every macro-state class. |
| `verify-lps-docs.py` output churn | **Do not land current output** | The concurrent run rewrote LPS proof revisions from `3` to `1`, creating proof-ledger revision/hash conflicts. Fix monotonic revision emission or restore the prior proof bytes before any merge. |
| Rewritten `task_graph.source.csv` | **Normalize before regeneration** | The concurrent writer converted the file to CRLF; `git diff --check` reports whitespace errors. Restore LF, then regenerate derived graph files from the corrected source. |
| Unrequested owner-ratification/decision proofs | **Exclude** | Blueprint integration does not authorize unrelated owner decisions. Any `owner_ratified: true` or passing decision proof requires its own explicit approval evidence. |
| `.claude` removals/archives, Python caches, temporary JSON, distribution output | **Outside this landing** | They are unrelated operational or transient changes and must not be bundled with the architecture-document integration. |

The last valid committed baseline already keeps `STORE-001` Draft. This clean
worktree intentionally lands only source artifacts, metadata, navigation, and
the compatibility review; it does not copy the unsupported proof chain.

## PR #35 additive integration resolution

The audit above is a truthful snapshot of the earlier concurrent worktree. It
does not describe the later, ordered integration of commits `7260b5a`,
`d546125`, and `d4ee554` requested for PR #35. That later sequence supplies the
STORE decision/proof surface and its explicit transition invariants while the
blueprint import remains cataloged evidence rather than implementation proof.

The integrated disposition is additive:

| Surface | Integrated resolution |
|---|---|
| Raw blueprint and context CSV exports | Preserve the cataloged source bytes and incomplete-provenance boundary from `8ae8cbf`. |
| STORE relationship and proof artifacts | Preserve the later tiered ownership decision, verified-cutover invariant, open RuVector/PostgreSQL dependencies, and no-product-mutation boundary from `7260b5a`; do not infer that the blueprint alone proves implementation. |
| LPS proof regeneration | Keep revisions monotonic and suppress timestamp-only rewrites so a verifier run cannot reset an accepted proof revision or create nondeterministic ledger conflicts. |
| Canonical task CSV | Normalize maintained projections to LF before regenerating raw, normalized, index, status, ledger, and package reports. Raw NotebookLM exports retain their original bytes. |
| Runtime transients | Exclude Python bytecode and PID files from source control; they are neither blueprint evidence nor planning proof. |

This resolution preserves both feature sets without treating either a stale
generated report or the historical concurrent-worktree audit as the current
source of authority.

## 2026-07-13 migration-package and task-table cross-reference

The current integration applies the Blueprint's control-plane, ingestion,
projection, portability, and integrity direction without importing its
unproven absolute claims. The exact Blueprint bytes remain bound by SHA-256
`014bbebb8afceee7f8deea236ed3b9425b61be3840fba47aee7c131f77268827`.

| Integrated change | Blueprint relationship | Current authority and disposition |
|---|---|---|
| Full moved envctl DB + nu_plugin migration package | Supplies concrete workflow, proof, recovery, visualization, parser/indexer, and migration design detail for the Blueprint's database-hosted development, Nushell/envctl bridge, COW, integrity, and release sections. | The [moved package](../envctl-db-nu-plugin-migration-automation-package/README.md) is the reference/workflow superset. Its statuses, proof files, and model approvals are evidence only. |
| Eight source CSV tables | Implements exact-source ingestion and deterministic projection principles from the Blueprint's three-pillar ingestion and structured-data-streaming sections. | All 428 rows remain source-qualified: 106 graph rows, 106 scope rows, 140 requirement rows, and 76 command rows. Source status never becomes LifeOS status. |
| 106 CDB WorkOrders | Converts source graph intent into bounded, hash-locked review packets consistent with the task-graph and isolated-execution direction. | Every `TASK-CDB000..105` record remains `review`, has zero execution proof, and requires actual human approval. |
| `handoff.task.v1` correction | Preserves bounded packet exchange without mistaking a transport envelope for the larger workflow. | `handoff.task.v1` is exactly one WorkOrder envelope; `handoff.task.v1.collection` only wraps 106 envelopes. Neither is the superset. |
| Mandatory feature catalog and reverse modal-language inventory | Turns architectural and package feature language into explicit review obligations instead of silently dropping recommended or conditional surfaces. | All 28 migration capabilities are mandatory. All 295 scoped `optional`/`should`/`may`/`must` occurrences across 87 sources are classified; zero normative occurrences are unclassified. Configurable activation does not make support or verification skippable. |
| Human approval and proof boundary | Implements the Blueprint's integrity intent using the planning spine's stricter authority graph and proof ledger. | Package agents cannot approve LifeOS work. All 106 imported actions remain pending human approval, and imported execution-proof count remains zero. |
| Append-only correction of unsupported completion | Reconciles Blueprint direction with the stronger rule that architecture prose is not completion proof. | Sixty-eight unsupported task completions are invalidated append-only; later valid proof revisions remain ordered. Current lifecycle truth is generated from the corrected source and ledger. |
| Deterministic navigation graph | Supports the Blueprint's Meta/GitKB coordination direction while avoiding dependence on a stale external index. | Exact lookups distinguish canonical tasks, imported WorkOrders, mandatory capabilities, claims, sources, proofs, and files. Markdown/wiki links are repository-portable and unresolved local links fail verification. |
| Host-independent navigation receipt | Enforces the Blueprint's reproducibility and portability direction at the generated-evidence boundary. | Runtime caches, bytecode, test caches, and PID files remain excluded from indexing but are never serialized into deterministic validation output. A clone-portability regression injects a host-only cache artifact and requires byte-identical graph, index, and validation receipts. |
| Configuration-inventory console hardening | Applies the Blueprint's secret-aware observability direction without promoting the raw Blueprint to security proof. | The generator emits only allowlisted task ID, constant pass/fail status, and package-relative report path fields. The detailed report remains bounded to artifact files, secret values remain uncaptured, and the current package manifest/landing receipt is refreshed without rewriting historical proof. |
| Bun/Vite/Tauri icon and build frontdoors | Aligns the UI/package surface with the Blueprint's Yazelix/Nix portability direction. | Bun and Bunx resolve through the Yazelix Nix profile; Vite runs Vue; Tauri package commands use Bun. This proves toolchain ownership, not universal static-musl portability. |

Owner scope rule: no feature is optional. Raw or historical uses of
`optional`, `recommended`, `should`, or `may` remain preserved as provenance,
but they create mandatory implementation/review obligations unless the owner
explicitly rejects the feature. Activation values can be configurable; parsing,
validation, safe fallback, compatibility, and verification cannot be omitted.

Machine routes: [landing contract](../ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md) ·
[task-table control plane](../task_tables/README.md) ·
[mandatory capabilities](../task_tables/workflow/mandatory_capabilities.json) ·
[modal-language inventory](../task_tables/workflow/mandatory_language_inventory.json) ·
[[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE]] ·
[[planning-spine-v0/task_tables/README]].

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
| Front door | profile-owned `lifeos-foundation-yzx/toolbin/git-kb` wrapper; its immutable store hash may rotate |
| Resolved binary | `/nix/store/g7lf0fnjxm22ijnvwcx38c7drkql4wnn-git-kb-0.2.12/bin/git-kb` |
| Installed version | `git-kb 0.2.12` |
| Index views | `code stats`: `0` symbols / `0` files; `doctor`: `2` Ruby symbols / `111` files — inconsistent |
| Repository discovery | no `[repos]` section; `git-kb repo list --json` returned `[]` |
| Read-only index dry run | `156` symbols from `351` files; `1,464` call sites; `138` imports |

The code index extracts symbols from executable source; Markdown produced zero
code symbols in the dry run. Therefore:

- use Markdown links and wiki links for planning-document navigation;
- use `git-kb code` for scripts, Rust, TypeScript, and other supported source;
- do not claim current call-graph coverage until the relevant branch/worktree is
  indexed and `doctor` agrees with `code stats`; and
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
  --branch "$(git branch --show-current)"
```

Index refresh, when it is part of the active task:

```bash
git-kb code index planning-spine-v0 --index-only \
  --branch "$(git branch --show-current)"
git-kb code index ../nu_plugin --index-only --worktree ../nu_plugin
git-kb code doctor --json
git-kb code stats --json
```

## Five-minute agent route

1. Read the repository contract: [`AGENTS.md`](../../AGENTS.md).
2. Read the package entrypoint: [`planning-spine-v0/README.md`](../README.md).
3. Use this document to separate proof from architectural intent:
   [[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]].
4. Open [[planning-spine-v0/1.0_VISION/FOUNDATION_ECOSYSTEM_MAP]] for
   built/planned ownership and
   [[planning-spine-v0/1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL]] for
   portability boundaries.
5. Read the raw blueprint only for original context:
   [[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]].
6. Follow normalized claims to their proof records before changing status.
7. Inspect CodeDB's [integration contracts](../../../nu_plugin/docs/INTEGRATION_CONTRACTS.md),
   [round-trip proof](../../../nu_plugin/docs/ROUND_TRIP_PROOF.md), and
   [release gate](../../../nu_plugin/docs/RELEASE_GATE.md) before modifying the
   ingestion, replay, source-authority, or release path.

## Remaining proof gaps

The CodeDB course is compatible, but the following subjects remain open:

- live RuVector semantic/embedding adapter for CodeDB;
- end-to-end Nushell → CodeDB → envctl → PostgreSQL/RuVector synchronization;
- database-hosted semantic edit plans that still preserve CodeDB approval and
  materialization gates;
- envctl production-branch projection from database rows;
- AgentDB/`.rvf` and ruvllm runtime integration;
- SONA/FastGRNN, ATAS/ESN/RuvLTRA, MinCut, and causal-GNN enforcement;
- LifeOS/Yazelix UDS or shared-store ownership contract;
- full-stack static-musl or bundled-closure portability proof;
- a populated, branch-current GitKB code index and explicit repository config;
- an exact-clean-tree public release receipt with detached attestation whenever
  public release readiness is claimed.
- an explicit, evidence-linked owner decision for `STORE-001`, with current,
  transitional, and target state modeled separately and all required
  simulations complete.

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
