---
id: lifeos.planning-spine.envctl-db-nu-plugin-migration-package
title: envctl DB + nu_plugin Migration Package Landing Contract
description: Evidence-aware landing, namespace, capability, approval, and truth boundary for the copied envctl migration-automation reference package.
type: reference-package-landing-contract
status: active-review
lifecycle: maintained
created: 2026-07-13
updated: 2026-07-13
authority:
  desired_architecture: maintained-contract
  implementation_truth: reference-only
  completion_authority: false
  approval_authority: false
source:
  repository: src/envctl
  last_package_commit: c0d672ce59a642e5f1362fd72d5f7ac03f7da083
  checkout_head: b62669c4e32c8de0407aa51ca3add94d529b50b6
landing:
  package_path: planning-spine-v0/envctl-db-nu-plugin-migration-automation-package
  receipt: planning-spine-v0/generated/envctl_package_landing_receipt.json
  capability_catalog: planning-spine-v0/task_tables/workflow/mandatory_capabilities.json
  mandatory_language_inventory: planning-spine-v0/task_tables/workflow/mandatory_language_inventory.json
  control_plane_companion: planning-spine-v0/task_tables
  namespace_registry: planning-spine-v0/task_tables/workflow/reference_namespaces.json
aliases:
  - envctl migration package landing
  - migration automation reference package
  - envctl nu_plugin package contract
tags:
  - lifeos
  - planning-spine
  - envctl
  - nu-plugin
  - migration
  - provenance
  - capability-catalog
  - human-approval
related:
  - "[[planning-spine-v0/README]]"
  - "[[planning-spine-v0/1.0_VISION/README]]"
  - "[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]"
  - "[[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]]"
  - "[[planning-spine-v0/08_EXECUTION_GATES]]"
  - "[[planning-spine-v0/task_tables/README]]"
  - "[[planning-spine-v0/task_tables/workflow/mandatory_capabilities.json]]"
  - "[[planning-spine-v0/task_tables/workflow/mandatory_language_inventory.json]]"
  - "[[planning-spine-v0/task_tables/workflow/reference_namespaces.json]]"
  - "[[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_SECURITY_REVIEW]]"
---

# envctl DB + nu_plugin Migration Package Landing Contract

This document lands the copied
[envctl DB + nu_plugin migration-automation package](./envctl-db-nu-plugin-migration-automation-package/README.md)
as a mandatory architecture and workflow reference. It does not accept the
package's task statuses, proof files, completion reports, or model-authored
approvals as LifeOS truth.

Portable links are the filesystem route; the adjacent wiki links are the
knowledge-graph route. The exact machine receipt is
[`generated/envctl_package_landing_receipt.json`](./generated/envctl_package_landing_receipt.json).

Wiki routes: [[planning-spine-v0/envctl-db-nu-plugin-migration-automation-package/README]] ·
[[planning-spine-v0/generated/envctl_package_landing_receipt.json]] ·
[[planning-spine-v0/task_tables/README]] ·
[[planning-spine-v0/task_tables/workflow/mandatory_capabilities.json]] ·
[[planning-spine-v0/task_tables/workflow/reference_namespaces.json]] ·
[[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_SECURITY_REVIEW]]

The value-free [security review](./ENVCTL_DB_NU_PLUGIN_MIGRATION_SECURITY_REVIEW.md) ·
[[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_SECURITY_REVIEW]] binds the
complete staged credential scan to exact reviewed fingerprints. It preserves
the pre-adaptation receipt, binds every current hardened package byte through
the refreshed manifest, and permits no rule-wide or path-wide secret-scan
exclusion.

## Truth and authority boundary

Apply the planning-spine truth order without exception:

1. Current checked source, executable tests, and explicit owner decisions.
2. LifeOS maintained contracts and accepted append-only proof.
3. Exact source/package receipts and deterministic review-only projections.
4. Maintained compatibility analysis.
5. Raw architecture input.

Accordingly:

- package claims are architecture and provenance inputs, not present-state
  proof;
- package `complete`, `completed`, `passed`, and `pass_no_gaps` values are
  inadmissible as LifeOS task status;
- package proof files and agent-review approvals are historical evidence only;
- no agent or model may satisfy a LifeOS human-approval gate; and
- consequential work remains denied until an actual human approves the exact
  action before it runs under
  [08 Execution Gates](./08_EXECUTION_GATES.md) ·
  [[planning-spine-v0/08_EXECUTION_GATES]].

The raw
[Architecture Blueprint](<./1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md>) ·
[[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]]
remains architecture input. Read the maintained
[Blueprint Compatibility review](./1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) ·
[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]
before using it to interpret implementation state.

## Landing receipt

The pre-adaptation receipt preserves the source checkout exactly as it was
audited. The current receipt describes the hardened copy now present in this
planning spine; it does not rewrite the historical values.

| Receipt field | Pre-adaptation source | Current hardened landing |
|---|---:|---:|
| Source checkout HEAD | `b62669c4e32c8de0407aa51ca3add94d529b50b6` | copied reference; no new source-authority claim |
| Last source commit touching the package | `c0d672ce59a642e5f1362fd72d5f7ac03f7da083` | preserved as lineage |
| Total files | `891` | root manifest declares `891` source files, excluding itself and runtime caches |
| Correct root-manifest coverage | `890` | `891` source entries after landing-hardening files were added |
| Root manifest SHA-256 | `57c09c926ab1bc14c2fda7d3ea0d73e85c16c6d597620432573a44acdec2925e` | `5c7616c712653de1c73d5af372548a51eb22b9f7272b1643640175e0d8d8ba01` |
| Payload SHA-256 | `f854659b111204be3c76f1a632c9165cac9a41cd5a6049475ce1ba66fb5ea767` | manifest-entry payload index: `34381ea9bfba19082b227539fbab3531f887a694b3e4a66e000026d3b337ba7f` |
| Unlisted source files | `157` | `0` under the hardened manifest contract |
| Listed byte/hash drift | `101` | `0` under the hardened manifest contract |

The current payload-index digest is SHA-256 over the UTF-8 compact JSON array
stored at `PACKAGE_MANIFEST.json.files`, in manifest order, with the stored
`path`, `bytes`, and `sha256` key order. It binds the complete sorted manifest
entry set; every entry then binds its source bytes.

The package-local manifest checker and its focused tests passed when the
receipt was written. The canonical task-table audit is
[`reference_package_audit.json`](./task_tables/workflow/reference_package_audit.json).
That receipt proves package membership and byte identity only; it proves no
package task was executed successfully in LifeOS.

## Namespace separation

The [namespace registry](./task_tables/workflow/reference_namespaces.json) ·
[[planning-spine-v0/task_tables/workflow/reference_namespaces.json]] keeps all three
task spaces distinct:

| Namespace | Count | Treatment |
|---|---:|---|
| `reference-framework` | 80 | Package provenance only; status, packets, proofs, and approvals are not imported as LifeOS truth. |
| `reference-issue-414` | 12 | Package provenance only; never merged with the framework or CDB graph. |
| `nu-plugin-cdb-handoff` | 106 | Review-only `TASK-CDB000..105` WorkOrders; zero promoted tasks and zero execution proofs. |

An equal-looking ID across namespaces is not identity. Namespace-qualified
references are required, and no count contributes to the authoritative LifeOS
task-graph count merely because the copied package contains it.

## Mandatory capability catalog

All wording the source package described as optional, recommended with
`should`, or conditionally available with `may` is mandatory review scope in
LifeOS. The authoritative machine catalog is
[`mandatory_capabilities.json`](./task_tables/workflow/mandatory_capabilities.json);
[`mandatory_capabilities.csv`](./task_tables/workflow/mandatory_capabilities.csv)
is its human-readable projection.

The generated [mandatory-language inventory](./task_tables/workflow/mandatory_language_inventory.json) ·
[[planning-spine-v0/task_tables/workflow/mandatory_language_inventory.json]] reverse-scans
87 normative package and task-table sources. All 295 `optional`, `should`,
`may`, and `must` occurrences are classified, with zero unclassified normative
occurrences. Compatibility and nullable-state wording remains configurable only
in value; its parsing, validation, fallback, and compatibility behavior is
mandatory.

Wiki routes: [[planning-spine-v0/task_tables/workflow/mandatory_capabilities.json]] ·
[[planning-spine-v0/task_tables/workflow/mandatory_capabilities.csv]]

| Capability | Mandatory LifeOS contract |
|---|---|
| `CAP-MIG-001` | Human modes and risk ceilings: observer, approval-gated, operator, and agent-only. |
| `CAP-MIG-002` | Declared runtime inputs and resolved path receipts. |
| `CAP-MIG-003` | Generic target descriptors; FlexNetOS remains a fixture, never a hard-coded engine branch. |
| `CAP-MIG-004` | Verify-only, dry-run, safe replay, and explicitly approved full replay semantics. |
| `CAP-MIG-005` | Machine-testable actor authority and R0-R5 risk policy. |
| `CAP-MIG-006` | Status, timeline, operations, approvals, artifacts, graph, validation, and replay views. |
| `CAP-MIG-007` | Conflict scopes, atomic leases, ownership, expiry, and visible lock state. |
| `CAP-MIG-008` | Every projection binds its source records and hashes; projection-only truth is forbidden. |
| `CAP-MIG-009` | Mermaid, DOT, TUI, event-stream, HTML, and wiki views derived from canonical state. |
| `CAP-MIG-010` | Explicit nullable comparison root with resolved/absent evidence. |
| `CAP-MIG-011` | Secret-aware command redaction before persistence. |
| `CAP-MIG-012` | Canonical, monotonic, tamper-detecting event hash chains. |
| `CAP-MIG-013` | Fail-closed completion with schema-valid proof and actually passing verification. |
| `CAP-MIG-014` | Structured version constraints, incompatibilities, and upgrade blockers. |
| `CAP-MIG-015` | Ordered artifact ladder from inventory through rollback. |
| `CAP-MIG-016` | Evidence-bearing blocked scaffolds with no factual completion claims. |
| `CAP-MIG-017` | Linked partial/unknown artifacts that cannot satisfy completion. |
| `CAP-MIG-018` | Explicit envctl/plugin boundary choice with rationale and transaction tests. |
| `CAP-MIG-019` | Blocked-first filesystem rules and resolved-symlink containment. |
| `CAP-MIG-020` | Protocol semver and compatibility-tested optional-field evolution. |
| `CAP-MIG-021` | Bounded, self-contained execution packets. |
| `CAP-MIG-022` | Contract-first dependency order with safe parallel lanes. |
| `CAP-MIG-023` | Repository-accurate issue/PR references and checkout evidence. |
| `CAP-MIG-024` | Deterministic seeds bound to real IDs and hashes. |
| `CAP-MIG-025` | Export files remain projections; canonical identity, links, hashes, and status remain in the owning store. |
| `CAP-MIG-026` | Persistent navigation, artifact index, memory, and update receipts. |
| `CAP-MIG-027` | Notify-based incremental invalidation with mandatory polling fallback and inotify-limit resilience. |
| `CAP-MIG-028` | Mandatory Tier-2 and Tier-4 parser/indexer boundary contracts and fixtures. |

Catalog coverage is review completeness, not product completion. Each catalog
record remains `local_status: review` and `product_complete: false` until its
own LifeOS verification and proof gates pass.

## Agent route

| Need | Portable route | Wiki route |
|---|---|---|
| Inspect the copied package | [Package README](./envctl-db-nu-plugin-migration-automation-package/README.md) | [[planning-spine-v0/envctl-db-nu-plugin-migration-automation-package/README]] |
| Verify this landing receipt | [Machine receipt](./generated/envctl_package_landing_receipt.json) | [[planning-spine-v0/generated/envctl_package_landing_receipt.json]] |
| Audit current package bytes | [Reference package audit](./task_tables/workflow/reference_package_audit.json) | [[planning-spine-v0/task_tables/workflow/reference_package_audit.json]] |
| Inspect all 28 mandatory capabilities | [Capability catalog](./task_tables/workflow/mandatory_capabilities.json) | [[planning-spine-v0/task_tables/workflow/mandatory_capabilities.json]] |
| Audit every normative modal term | [Mandatory-language inventory](./task_tables/workflow/mandatory_language_inventory.json) | [[planning-spine-v0/task_tables/workflow/mandatory_language_inventory.json]] |
| Keep task IDs separate | [Namespace registry](./task_tables/workflow/reference_namespaces.json) | [[planning-spine-v0/task_tables/workflow/reference_namespaces.json]] |
| Inspect 106 review-only WorkOrders | [Task-table handoff](./task_tables/README.md) | [[planning-spine-v0/task_tables/README]] |
| Enforce proof and human gates | [08 Execution Gates](./08_EXECUTION_GATES.md) | [[planning-spine-v0/08_EXECUTION_GATES]] |
| Correct Blueprint claims | [Blueprint Compatibility](./1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) | [[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]] |
| Read raw architecture input | [Architecture Blueprint](<./1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md>) | [[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]] |

## Verification

From the LifeOS repository root:

```bash
python3 planning-spine-v0/envctl-db-nu-plugin-migration-automation-package/helpers/package_manifest.py --check
PYTHONPATH=planning-spine-v0/envctl-db-nu-plugin-migration-automation-package \
  python3 -m unittest helpers.test_package_manifest
bunx --no-install --bun vitest run tests/planning-spine-package-landing.spec.js
bunx --no-install --bun vitest run tests/planning-spine-task-tables.spec.js
```

These commands verify the landing and review surfaces. They do not authorize
execution, create LifeOS task proof, or replace the actual-human gate.
