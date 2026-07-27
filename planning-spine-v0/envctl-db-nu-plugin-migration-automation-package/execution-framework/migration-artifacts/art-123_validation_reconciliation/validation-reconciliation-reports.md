# Validation reconciliation reports

Generated at: `2026-07-27T05:01:17+00:00`
Status: `passed`

## Parity

| Check | Count |
|---|---:|
| Task graph rows | 80 |
| Execution packets | 80 |
| Status report tasks | 80 |
| Proof records | 89 |
| Successful tasks | 80 |
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
| 00-framework | 8 | 8 | 0 | 0 |
| 01-contract | 1 | 1 | 0 | 0 |
| 02-envctl-db | 9 | 9 | 0 | 0 |
| 03-nu-plugin | 5 | 5 | 0 | 0 |
| 04-shared | 6 | 6 | 0 | 0 |
| 05-artifacts | 37 | 37 | 0 | 0 |
| 06-flexnetos | 3 | 3 | 0 | 0 |
| 07-verification | 5 | 5 | 0 | 0 |
| 08-release | 2 | 2 | 0 | 0 |
| 09-drive-maintenance | 4 | 4 | 0 | 0 |

## Checksums

| Path | SHA-256 |
|---|---|
| `execution-framework/generated/contract_manifest.json` | `2f6efd26d5dc2dda57d6bedf923ead6c5ed1dec55d72214455878d657e60e0f0` |
| `execution-framework/generated/envctl_artifact_registry_report.json` | `df6874e82bf27e006f0def5d6a7877e8a4ee7e0bc575fd651385fcb0ad2c4796` |
| `execution-framework/generated/envctl_migration_db_model.json` | `443308663dadb2c59daac71c4410b7adb39dda47ed4c2070d42b4b39fb7eef50` |
| `execution-framework/generated/envctl_target_registry.json` | `f7280403b786bdb64f1db7e5b6e1cdbe2423b49c663e4272fe2d6fadf2d6d240` |
| `execution-framework/generated/envctl_validation_evidence_report.json` | `eb9d30a10073e5a6aa4f8379d9de2df1547da118fcb24149c1c7823dc5d136b3` |
| `execution-framework/generated/final_verification_report.json` | `290e3ef1c634f7cb6192d2023b1b39ce190a89b78b6c68ecdafcfe17e0e8e50b` |
| `execution-framework/generated/package_scan.json` | `44ca32f3ea0723be1e8d0cef98c43b150815d546eb19a95be58b6ba7609e1a40` |
| `execution-framework/generated/shared_protocol_validation_report.json` | `0863b9b28e702c704c96f50a50954181f42b35aaa16e4ecb6643497093c4c4d0` |
| `execution-framework/generated/status_from_proofs.json` | `f5877a781757bcacc922d41ee4aceffeb19eaa54bdbd4733f182efa12254a022` |
| `execution-framework/generated/task_graph.csv` | `b752be4c4cf53cb3db3daf5daaef180ec291269ce67a7bb7f0dbb2e835168009` |

## Contract Mapping

- Contract row: `artifact:06-testing-validation-validation-reconciliation-reports-md`
- Canonical path: `migration-artifacts/06-testing-validation/validation-reconciliation-reports.md`
- Task-scoped Markdown: `migration-artifacts/art-123_validation_reconciliation/validation-reconciliation-reports.md`
- Task-scoped JSON: `migration-artifacts/art-123_validation_reconciliation/validation-reconciliation-reports.json`

## Output Gate

The artifact registry gate is satisfied when the task-scoped Markdown, task-scoped JSON, and canonical contract Markdown paths are registered with SHA-256 content hashes and linked to validation evidence.
