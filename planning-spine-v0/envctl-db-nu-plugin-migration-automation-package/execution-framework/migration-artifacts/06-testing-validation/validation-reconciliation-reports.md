# Validation reconciliation reports

Generated at: `2026-07-28T12:30:27+00:00`
Status: `passed`

## Parity

| Check | Count |
|---|---:|
| Task graph rows | 763 |
| Execution packets | 763 |
| Status report tasks | 763 |
| Proof records | 787 |
| Successful tasks | 760 |
| Missing packets | 0 |
| Successful tasks without proof | 0 |

## Counts

| Area | Metric | Count |
|---|---|---:|
| Artifact registry | evidence rows | 3 |
| Artifact registry | graph edges | 4 |
| Artifact registry | validation rows | 2 |
| Validation evidence | validation rows | 3 |
| Validation evidence | evidence rows | 4 |
| Validation evidence | hashed evidence rows | 4 |
| Shared protocols | samples passed | 14 / 14 |
| Final verification | missing outputs | 0 |
| Final verification | unresolved gaps | 0 |

## Phase Status Counts

| Phase | Tasks | Complete or passed | Pending | Other |
|---|---:|---:|---:|---:|
| 00-anchor | 15 | 15 | 0 | 0 |
| 00-atlas | 24 | 24 | 0 | 0 |
| 00-components | 548 | 548 | 0 | 0 |
| 00-currency | 29 | 29 | 0 | 0 |
| 00-framework | 8 | 7 | 0 | 1 |
| 00-invariants | 19 | 19 | 0 | 0 |
| 00-pipelines | 8 | 8 | 0 | 0 |
| 00-review | 19 | 19 | 0 | 0 |
| 00-rules | 21 | 21 | 0 | 0 |
| 01-contract | 1 | 1 | 0 | 0 |
| 02-envctl-db | 9 | 9 | 0 | 0 |
| 03-nu-plugin | 5 | 5 | 0 | 0 |
| 04-shared | 6 | 6 | 0 | 0 |
| 05-artifacts | 37 | 37 | 0 | 0 |
| 06-flexnetos | 3 | 3 | 0 | 0 |
| 07-verification | 5 | 3 | 0 | 2 |
| 08-release | 2 | 2 | 0 | 0 |
| 09-drive-maintenance | 4 | 4 | 0 | 0 |

## Checksums

| Path | SHA-256 |
|---|---|
| `execution-framework/generated/contract_manifest.json` | `ae87ddcf893f85a5376704192428173e168fa5c0d30238994d97ddc1c6a1bed5` |
| `execution-framework/generated/envctl_artifact_registry_report.json` | `2a4f2bc105569ff1d56fa08e6336ef518290a12ccf80622cb649cc57c6b81f90` |
| `execution-framework/generated/envctl_migration_db_model.json` | `a0513aa468e1ab973cffa4834fe896094a4f9cb39fbe7976bddbe64ff70b0160` |
| `execution-framework/generated/envctl_target_registry.json` | `6a4248bfc27acf25bb6a3b0bcc2128712263d53befa316449aa0f5efd00669c8` |
| `execution-framework/generated/envctl_validation_evidence_report.json` | `2e6cc1a9d25688a7234f56ad821020e88ac61efa8eb14cfed425fa02c31df71e` |
| `execution-framework/generated/final_verification_report.json` | `8c00eac88efea4a7883beb97835f03e25ac162da327d8988bc1f31a86a1802e8` |
| `execution-framework/generated/package_scan.json` | `3694a6122897f3e11f11a60dbebe8514aa2a6e5e508a6d352324f45da9cc7159` |
| `execution-framework/generated/shared_protocol_validation_report.json` | `ff165dd56cd3919fa52e3cc059db120f9ad42756d1a02b8177021b95271228f5` |
| `execution-framework/generated/status_from_proofs.json` | `9c98d93c9c6e980c0c3fe8676bcd53ee6625ef930c57fe6697b5e4b5e8fdea52` |
| `execution-framework/generated/task_graph.csv` | `28a74f19bfb416b704727f0cbec303b96d05a02671537089ce93dc8f5653a1e4` |

## Contract Mapping

- Contract row: `artifact:06-testing-validation-validation-reconciliation-reports-md`
- Canonical path: `migration-artifacts/06-testing-validation/validation-reconciliation-reports.md`
- Task-scoped Markdown: `migration-artifacts/art-123_validation_reconciliation/validation-reconciliation-reports.md`
- Task-scoped JSON: `migration-artifacts/art-123_validation_reconciliation/validation-reconciliation-reports.json`

## Output Gate

The artifact registry gate is satisfied when the task-scoped Markdown, task-scoped JSON, and canonical contract Markdown paths are registered with SHA-256 content hashes and linked to validation evidence.
