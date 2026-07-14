---
id: lifeos.vision.index
title: LifeOS Vision Navigation Index
description: Human- and agent-oriented entrypoint for LifeOS architecture, evidence boundaries, and planning-spine source material.
type: navigation-index
status: active
lifecycle: maintained
created: 2026-07-12
updated: 2026-07-14
navigation:
  authority_order: source-tests-proof-normalized-claims-architecture-input
  markdown_links: required
  wiki_links: required
gitkb:
  installed_version: 0.2.12
  current_branch_index_symbols: 0
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
  - "[[ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]"
  - "[[ARCHITECTURE_BLUEPRINT_TASK_COVERAGE]]"
  - "[[FOUNDATION_ECOSYSTEM_MAP]]"
  - "[[FOUNDATION_META_PORTABILITY_MODEL]]"
  - "[[NORTH_STAR]]"
---

# LifeOS Vision Navigation Index

Use this file as the entrypoint for `planning-spine-v0/1.0_VISION`. Wiki links
support knowledge tools; adjacent Markdown links remain the portable filesystem
navigation path.

## Truth and authority order

1. Checked implementation source and executable tests.
2. Exact receipts and [`proof_records/`](../proof_records/).
3. Normalized claims under [`generated/`](../generated/).
4. Maintained architecture maps and compatibility reviews.
5. NotebookLM artifacts and consolidated vision documents as design input.

Repetition, a diagram, or a polished architecture narrative does not promote a
claim above executable evidence.

## Start here

| Need | Canonical entrypoint | Wiki link |
|---|---|---|
| Repository operating contract | [`AGENTS.md`](../../AGENTS.md) | [[AGENTS]] |
| Planning-spine contract | [`planning-spine-v0/README.md`](../README.md) | [[planning-spine-v0/README]] |
| Blueprint compatibility and corrections | [Architecture Blueprint Compatibility](./ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) | [[ARCHITECTURE_BLUEPRINT_COMPATIBILITY]] |
| Blueprint requirement-to-task coverage | [Architecture Blueprint Task Coverage](./ARCHITECTURE_BLUEPRINT_TASK_COVERAGE.md) | [[ARCHITECTURE_BLUEPRINT_TASK_COVERAGE]] |
| Ecosystem ownership and built/planned map | [Foundation Ecosystem Map](./FOUNDATION_ECOSYSTEM_MAP.md) | [[FOUNDATION_ECOSYSTEM_MAP]] |
| Meta and portability model | [Foundation Meta Portability Model](./FOUNDATION_META_PORTABILITY_MODEL.md) | [[FOUNDATION_META_PORTABILITY_MODEL]] |
| Product north star | [North Star](./NORTH_STAR.md) | [[NORTH_STAR]] |
| Consolidated strategy | [LifeOS Master Plan](<./LifeOS Master Plan — Consolidated v1 (2026-07-07).md>) | [[LifeOS Master Plan — Consolidated v1 (2026-07-07)]] |
| Raw NotebookLM architecture input | [Architecture Blueprint](<./Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md>) | [[Notebooklm/Architecture Blueprint - LifeOS Core Foundation]] |
| Current execution snapshot | [`EXECUTION_STATUS.md`](../EXECUTION_STATUS.md) | [[EXECUTION_STATUS]] |

## Evidence routes

| Topic | First evidence to inspect |
|---|---|
| NotebookLM source provenance | [`notebooklm_source_registry.source.csv`](../generated/notebooklm_source_registry.source.csv) and [`notebooklm_source_extracts/`](../generated/notebooklm_source_extracts/) |
| Blueprint ingestion claims | [`NBSOURCE-003`](../generated/notebooklm_source_extracts/NBSOURCE-003-nushell-redb-postgresql.md) and [`NBSOURCE-030`](../generated/notebooklm_source_extracts/NBSOURCE-030-three-pillars-code-ingestion.md) |
| NPM, Bun, napi-rs, native source | [`NBSOURCE-029`](../generated/notebooklm_source_extracts/NBSOURCE-029-npm-rust-development-speed.md) and [CodeDB integration contracts](../../../nu_plugin/docs/INTEGRATION_CONTRACTS.md) |
| envctl projection claims | [`NBSOURCE-031`](../generated/notebooklm_source_extracts/NBSOURCE-031-envctl-projection-engine.md) |
| Yazelix/Nushell plugin claims | [`NBSOURCE-032`](../generated/notebooklm_source_extracts/NBSOURCE-032-yazelix-nushell-native-plugin.md) |
| Claim-level truth testing | [`NBVERIFY-030-032`](../proof_records/NBVERIFY-030-032.proof.json) and its [local evidence](../generated/notebooklm_claim_verification/NBVERIFY-030-032.local-evidence.json) |
| CodeDB exact replay | [Round-trip proof](../../../nu_plugin/docs/ROUND_TRIP_PROOF.md) |
| CodeDB mutation boundary | [Unsafe capture policy](../../../nu_plugin/docs/UNSAFE_CAPTURE_POLICY.md) and [release gate](../../../nu_plugin/docs/RELEASE_GATE.md) |
| envctl DB and Nu plugin migration package | [Migration package](../ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md) |

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
receipt. Use dual links when possible: `[[WIKI LINK]]` for graph navigation and
`[Markdown link](path)` for portable local navigation.

## GitKB operating note

The Yazelix/Nix profile currently resolves `git-kb` to the immutable Nix-store
`git-kb 0.2.12` binary, matching the
[latest published release](https://github.com/gitkb/gitkb-releases/releases/tag/v0.2.12)
checked on 2026-07-12.

Current limitations are explicit:

- the LifeOS branch code index contains zero symbols;
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
  --branch planning-spine-nbstated-2026-07-12
```

Use the exact index-write commands and boundaries in
[[ARCHITECTURE_BLUEPRINT_COMPATIBILITY#GitKB navigation and index contract]]
only after the index mutation is explicitly authorized.

## Agent retrieval rules

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
