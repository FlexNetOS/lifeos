---
id: lifeos.planning-spine.v0
title: LifeOS Planning Spine v0
description: Buildable architecture, task, authority, simulation, and proof contract for the first LifeOS execution spine.
type: planning-contract
status: active
lifecycle: maintained
created: 2026-07-03
updated: 2026-07-13
aliases:
  - LifeOS planning spine
  - Planning spine v0
tags:
  - lifeos
  - planning-spine
  - execution
  - proof
related:
  - "[[planning-spine-v0/navigation/README]]"
  - "[[planning-spine-v0/00_NORTH_STAR]]"
  - "[[planning-spine-v0/1.0_VISION/README]]"
  - "[[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE]]"
  - "[[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_SECURITY_REVIEW]]"
---

# LifeOS Planning Spine v0

This package converts the `lifeos-planning-spine v0` source brief into a buildable architecture contract for the first LifeOS execution spine.

## Agent Quick Navigation

- Instant task, claim, proof, topic, and file recall:
  [`navigation/README.md`](./navigation/README.md) · [[planning-spine-v0/navigation/README]]
- Vision index: [`1.0_VISION/README.md`](./1.0_VISION/README.md) ·
  [[planning-spine-v0/1.0_VISION/README]]
- Blueprint compatibility and session-course audit:
  [`ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md`](./1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) ·
  [[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]
- envctl DB + nu_plugin migration-package landing, truth boundary, and
  mandatory-capability route:
  [`ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md`](./ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md) ·
  [[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE]]
- Exact-fingerprint credential and fixture review for the immutable package:
  [`ENVCTL_DB_NU_PLUGIN_MIGRATION_SECURITY_REVIEW.md`](./ENVCTL_DB_NU_PLUGIN_MIGRATION_SECURITY_REVIEW.md) ·
  [[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_SECURITY_REVIEW]]
- Raw NotebookLM artifact catalog:
  [`1.0_VISION/Notebooklm/README.md`](./1.0_VISION/Notebooklm/README.md) ·
  [[planning-spine-v0/1.0_VISION/Notebooklm/README]]
- Ecosystem ownership map:
  [`FOUNDATION_ECOSYSTEM_MAP.md`](./1.0_VISION/FOUNDATION_ECOSYSTEM_MAP.md) ·
  [[planning-spine-v0/1.0_VISION/FOUNDATION_ECOSYSTEM_MAP]]
- Portability model:
  [`FOUNDATION_META_PORTABILITY_MODEL.md`](./1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL.md) ·
  [[planning-spine-v0/1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL]]

Desired architecture and implementation truth are separate axes. Explicit owner
decisions govern desired targets. Checked source/tests, exact proof, normalized
claims, maintained reviews, and raw NotebookLM inputs govern current-state truth
in that order. Read the compatibility review before treating blueprint wording
as implementation state.

## Mandatory Feature Policy

Owner directive: no planning feature is optional. Any source or historical
artifact that says `optional`, `recommended`, `should`, or `may` contributes
mandatory implementation and review scope unless the owner explicitly rejects
that feature. A runtime activation value may remain configurable, but support,
parsing, validation, safe fallback, compatibility behavior, and verification
are mandatory. Raw and proof-bound artifacts retain their original bytes for
provenance; their modal wording does not override this maintained contract.

For the envctl DB + nu_plugin migration, the exact machine-enforced projection
is the [28-capability catalog](./task_tables/workflow/mandatory_capabilities.json)
plus the [mandatory-language inventory](./task_tables/workflow/mandatory_language_inventory.json),
which classifies every scoped occurrence and permits zero unclassified
normative terms.

Status table:

| Scope | Status | Meaning |
|---|---|---|
| `v0` | In scope | Intent -> authority graph -> task graph -> DevWorld simulation -> hermetic cell -> proof ledger -> next-action recommendation |
| `RFC` | Mandatory design/review scope | Mirofish adapter and compiled agent brainpack remain approval- and proof-gated before implementation. |
| `post-v0` | Mandatory sequenced scope | Full Odysseus, full Hermes, full company hierarchy, and standalone Mirofish follow the v0 slice; they are not removed from scope. |

First-slice exclusions (mandatory later, not feature deletions):

- No Docker-first runtime.
- No native dependence on full Odysseus integration.
- No native dependence on full Hermes integration.
- No full company hierarchy expansion.
- No standalone Mirofish build.

Preserved operating assumptions:

- LifeOS remains the operating environment.
- NOA remains the CEO agent.
- CECCA remains the internal CEO-agent role.

## Package Layout

| Path | Purpose |
|---|---|
| [`navigation/README.md`](./navigation/README.md) | Human agent start page and query examples for the deterministic graph |
| [`navigation/source.json`](./navigation/source.json) | Authored semantic routes, authority/lifecycle vocabulary, strict links, and structured adapters |
| [`navigation/schemas/index.json`](./navigation/schemas/index.json) | Schema registry for the graph, compact index, and validation report |
| [`00_NORTH_STAR.md`](./00_NORTH_STAR.md) | Product and control-plane aim |
| [`01_OBJECT_MODEL.md`](./01_OBJECT_MODEL.md) | Core entities and relationships |
| [`02_AUTHORITY_GRAPH.md`](./02_AUTHORITY_GRAPH.md) | Delegation and decision boundaries |
| [`03_TASK_GRAPH_SCHEMA.md`](./03_TASK_GRAPH_SCHEMA.md) | Task graph semantics and constraints |
| [`04_WORLDSEED_SCHEMA.md`](./04_WORLDSEED_SCHEMA.md) | DevWorld simulation seed contract |
| [`05_HERMETIC_CELL_CONTRACT.md`](./05_HERMETIC_CELL_CONTRACT.md) | Execution cell runtime boundary |
| [`06_PROOF_LEDGER.md`](./06_PROOF_LEDGER.md) | Proof recording and completion rules |
| [`07_MVP_VERTICAL_SLICE.md`](./07_MVP_VERTICAL_SLICE.md) | End-to-end MVP flow |
| [`08_EXECUTION_GATES.md`](./08_EXECUTION_GATES.md) | Required gates before progress/completion |
| [`09_OPEN_QUESTIONS.md`](./09_OPEN_QUESTIONS.md) | Explicit unresolved decisions |
| [`ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md`](./ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md) | Reference-package superset receipt, 28-capability mandatory catalog, namespace separation, and actual-human approval boundary |
| [`ENVCTL_DB_NU_PLUGIN_MIGRATION_SECURITY_REVIEW.md`](./ENVCTL_DB_NU_PLUGIN_MIGRATION_SECURITY_REVIEW.md) | Value-free classification and exact-fingerprint baseline for credential-shaped package fixtures and proof identifiers |
| `1.0_VISION/README.md` | Agent-oriented vision, authority, and evidence navigation |
| `1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md` | Blueprint-to-CodeDB compatibility review and concurrent landing audit |
| `1.0_VISION/Notebooklm/README.md` | Exact-byte raw artifact catalog and provenance boundary |
| `1.0_VISION/Notebooklm/artifacts.meta.json` | Machine-readable artifact hashes, sizes, types, and lineage gaps |
| `1.0_VISION/FOUNDATION_ECOSYSTEM_MAP.md` | Built/planned ecosystem ownership map |
| `1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL.md` | Meta coordination and portability boundaries |
| [`navigation/generated/navigation_graph.json`](./navigation/generated/navigation_graph.json) | Full deterministic file/entity graph with typed edges and backlinks |
| [`navigation/generated/navigation_index.json`](./navigation/generated/navigation_index.json) | Compact task/claim/source/path/alias/tag/topic lookup index |
| [`navigation/generated/navigation.validation_report.json`](./navigation/generated/navigation.validation_report.json) | Connectivity, metadata, link, ledger, and inventory verdict |
| `rfcs/` | Post-v0 and proposal surfaces |
| `schemas/` | JSON Schema contracts |
| `examples/` | Valid example instances for every schema |
| `examples/mvp-bundle.json` | Connected v0 MVP bundle manifest over the canonical examples |
| `state/mvp_bundle_report.json` | Machine-readable cross-object linkage report emitted by verification |
| `state/authority_integrity_report.json` | Machine-readable verifier-authority and proof-integrity report emitted by verification |

## Verification

Run:

```bash
bun run planning-spine:navigation:query -- "STORE-001"
bun run planning-spine:navigation:explain -- "claim:REDB-CLAIM-002"
bun run planning-spine:navigation:check
bun run planning-spine:verify
```

The navigation commands require a full repository checkout. The proof-bound
LPS-018 execution bundle intentionally excludes the repository-wide navigation
subtree and continues to use its own manifest and validation contract.

That frontdoor is Bun-backed in this repo; it does not require a standalone `node` binary on the host.

That verifier checks:

- all required package files exist,
- the committed agent-navigation graph/index/report are deterministic and
  current, every included resource has rich metadata, every node is reachable,
  and task/claim/source lookup keys resolve,
- every required schema exists,
- every schema declares required fields,
- `Task` requires `allowed_paths`, `blocked_paths`, `verification_gate`, `rollback_plan`, and `proof_uri`,
- every example instance satisfies its schema,
- the MVP task example contains proof-bearing completion fields,
- `examples/mvp-bundle.json` preserves the `v0` / `RFC` / `post-v0` boundary, and
- the bundle's `intent -> goal -> authority assignment -> task -> worldseed -> simulation report -> cell -> proof -> decision -> action -> artifact` chain resolves live into `planning-spine-v0/state/mvp_bundle_report.json`, and
- verifier authority resolves live into explicit agent/role/capability objects with proof-link integrity emitted to `planning-spine-v0/state/authority_integrity_report.json`.
- vision-navigation Markdown and wiki links resolve inside the repository, and
- every raw NotebookLM artifact matches the exact digest, byte count, and
  newline count in `1.0_VISION/Notebooklm/artifacts.meta.json`.

## Implementation Boundary

The v0 implementation target is intentionally narrow:

1. Capture intent.
2. Compile authority into a graph.
3. Materialize tasks with hard execution constraints.
4. Simulate the work in DevWorld.
5. Apply simulation constraints back into the task graph.
6. Execute inside a hermetic cell.
7. Record proof before completion.
8. Recommend the next action from proven state.

Anything outside that loop is documented as RFC or post-v0, not silently smuggled into the contract.
