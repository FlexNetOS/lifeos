---
id: lifeos.vision.index
title: LifeOS Vision Navigation Index
description: Human- and agent-oriented entrypoint for LifeOS architecture, evidence boundaries, and planning-spine source material.
type: navigation-index
status: active
lifecycle: maintained
created: 2026-07-12
updated: 2026-07-12
navigation:
  desired_architecture_order: explicit-owner-decision-operating-contract-maintained-contract-architecture-input
  implementation_truth_order: source-tests-proof-normalized-claims-architecture-input
  markdown_links: required
  wiki_links: required
gitkb:
  installed_version: 0.2.12
  code_stats_symbols: 0
  doctor_symbols: 2
  index_views_consistent: false
  index_write_performed: false
aliases:
  - Vision index
  - Architecture index
tags:
  - lifeos
  - vision
  - architecture
  - navigation
  - gitkb
related:
  - "[[planning-spine-v0/navigation/README]]"
  - "[[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE]]"
  - "[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]"
  - "[[planning-spine-v0/1.0_VISION/FOUNDATION_ECOSYSTEM_MAP]]"
  - "[[planning-spine-v0/1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL]]"
  - "[[planning-spine-v0/1.0_VISION/NORTH_STAR]]"
---

# LifeOS Vision Navigation Index

Use this file as the entrypoint for `planning-spine-v0/1.0_VISION`. Wiki links
support knowledge tools; adjacent Markdown links remain the portable filesystem
navigation path.

## Authority and truth order

Keep desired architecture separate from current implementation truth:

1. **Desired architecture:** explicit owner decisions, then the repository
   operating contract and North Star, then maintained planning contracts, then
   unadopted architecture inputs.
2. **Current implementation truth:** checked source and executable tests, then
   exact receipts and [`proof_records/`](../proof_records/), then normalized
   claims under [`generated/`](../generated/), then maintained compatibility
   maps, then raw architecture inputs.

Repetition, a diagram, or a polished architecture narrative does not promote a
claim above executable evidence. A desired target becomes a decision only with
an explicit owner record; it does not become current-state proof.

## Start here

| Need | Canonical entrypoint | Wiki link |
|---|---|---|
| Instant planning-spine graph recall | [Agent Navigation](../navigation/README.md) | [[planning-spine-v0/navigation/README]] |
| Repository operating contract | [`AGENTS.md`](../../AGENTS.md) | [[./AGENTS]] |
| Planning-spine contract | [`planning-spine-v0/README.md`](../README.md) | [[planning-spine-v0/README]] |
| envctl DB + nu_plugin package landing and mandatory-capability boundary | [Migration Package Landing Contract](../ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md) | [[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE]] |
| Blueprint compatibility and corrections | [Architecture Blueprint Compatibility](./ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) | [[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]] |
| Raw NotebookLM artifact catalog | [NotebookLM Artifact Catalog](./Notebooklm/README.md) | [[planning-spine-v0/1.0_VISION/Notebooklm/README]] |
| Ecosystem ownership and built/planned map | [Foundation Ecosystem Map](./FOUNDATION_ECOSYSTEM_MAP.md) | [[planning-spine-v0/1.0_VISION/FOUNDATION_ECOSYSTEM_MAP]] |
| Meta and portability model | [Foundation Meta Portability Model](./FOUNDATION_META_PORTABILITY_MODEL.md) | [[planning-spine-v0/1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL]] |
| Product north star | [North Star](./NORTH_STAR.md) | [[planning-spine-v0/1.0_VISION/NORTH_STAR]] |
| Consolidated strategy | [LifeOS Master Plan](<./LifeOS Master Plan — Consolidated v1 (2026-07-07).md>) | [[planning-spine-v0/1.0_VISION/LifeOS Master Plan — Consolidated v1 (2026-07-07)]] |
| Raw NotebookLM architecture input | [Architecture Blueprint](<./Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md>) | [[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]] |
| Current execution snapshot | [`EXECUTION_STATUS.md`](../EXECUTION_STATUS.md) | [[planning-spine-v0/EXECUTION_STATUS]] |

## Evidence routes

| Topic | First evidence to inspect |
|---|---|
| Raw export identity and checksums | [NotebookLM Artifact Catalog](./Notebooklm/README.md) and [`artifacts.meta.json`](./Notebooklm/artifacts.meta.json) |
| NotebookLM source provenance | [`notebooklm_source_registry.source.csv`](../generated/notebooklm_source_registry.source.csv) and [`notebooklm_source_extracts/`](../generated/notebooklm_source_extracts/) |
| Blueprint ingestion claims | [`NBSOURCE-003`](../generated/notebooklm_source_extracts/NBSOURCE-003-nushell-redb-postgresql.md) and [`NBSOURCE-030`](../generated/notebooklm_source_extracts/NBSOURCE-030-three-pillars-code-ingestion.md) |
| NPM, Bun, napi-rs, native source | [`NBSOURCE-029`](../generated/notebooklm_source_extracts/NBSOURCE-029-npm-rust-development-speed.md) and [CodeDB integration contracts](../../../nu_plugin/docs/INTEGRATION_CONTRACTS.md) |
| envctl projection claims | [`NBSOURCE-031`](../generated/notebooklm_source_extracts/NBSOURCE-031-envctl-projection-engine.md) |
| Yazelix/Nushell plugin claims | [`NBSOURCE-032`](../generated/notebooklm_source_extracts/NBSOURCE-032-yazelix-nushell-native-plugin.md) |
| Claim-level truth testing | [`NBVERIFY-030-032`](../proof_records/NBVERIFY-030-032.proof.json) and its [local evidence](../generated/notebooklm_claim_verification/NBVERIFY-030-032.local-evidence.json) |
| CodeDB exact replay | [Round-trip proof](../../../nu_plugin/docs/ROUND_TRIP_PROOF.md) |
| CodeDB mutation boundary | [Unsafe capture policy](../../../nu_plugin/docs/UNSAFE_CAPTURE_POLICY.md) and [release gate](../../../nu_plugin/docs/RELEASE_GATE.md) |
| Store-authority decision state | [`STORE-001` decision brief](../generated/store_001_decision_brief.md), canonical [`task_graph.source.csv`](../generated/task_graph.source.csv), and proof ledger |

## Metadata convention for new maintained documents

Use YAML frontmatter with these fields when applicable:

| Field | Meaning |
|---|---|
| `id` | Stable namespaced identity; do not derive solely from a filename. |
| `title` | Human-readable title. |
| `description` | One-sentence retrieval summary. |
| `type` | `navigation-index`, `architecture-cross-reference`, `decision`, `runbook`, or another explicit document class. |
| `status` | Evidence-aware state such as `active`, `verified-with-gaps`, `proposed`, or `superseded`. |
| `lifecycle` | Maintenance state such as `maintained`, `active`, or `archived`. |
| `created` / `updated` | ISO dates. |
| `aliases` | Search and wiki-link aliases. |
| `tags` | Low-cardinality retrieval facets. |
| `related` | Wiki links to adjacent authority or context documents. |
| `review` | Exact repository, commit range, and verification boundary when the document audits implementation. |

Do not add metadata that cannot be maintained or that implies proof absent a
receipt. Use dual links when possible: a path-qualified wiki link for graph
navigation and a standard Markdown link for portable local navigation.

## GitKB operating note

The Yazelix/Nix profile currently resolves `git-kb` to the immutable Nix-store
`git-kb 0.2.12` binary.

Current limitations are explicit:

- `git-kb code stats --json` reports zero symbols and zero files for this
  worktree, while `git-kb doctor --json` reports two Ruby symbols across 111
  files; treat index coverage as inconsistent until those views agree;
- `.kb/config.toml` has no `[repos]` section and repository discovery is empty;
- a dry run over `planning-spine-v0` found 156 indexable code symbols from 351
  files, but Markdown contributes no code symbols; and
- no index write was performed during this compatibility review.

Read-only health path:

```bash
git-kb --version
git-kb doctor --json
git-kb code stats --json
git-kb code doctor --json
git-kb code index planning-spine-v0 --dry-run --index-only \
  --branch "$(git branch --show-current)"
```

Use the exact index-write commands and boundaries in
[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY#GitKB navigation and index contract]]
when refreshing the index is itself in scope.

## Agent retrieval rules

- Query the committed repository-native index first when the identifier or
  filename is unknown: `bun run planning-spine:navigation:query -- "<terms>"`.
- Search before building: use `rg` for exact local text and GitKB only after
  checking branch/index health.
- Treat NotebookLM files as source artifacts; follow normalized claim and proof
  links before accepting current-state language.
- Preserve source authority: do not replace exact organization-owned source
  receipts with a package-registry assumption.
- Keep semantic indexes derived from exact bytes; never make an embedding or
  graph projection the only copy of source truth.
- Do not infer completion from an older execution snapshot. Re-run the named
  verifier and record the current commit boundary.
