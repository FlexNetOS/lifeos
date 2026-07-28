# Test Coverage Matrix

- Task: `ART-124_TEST_COVERAGE`
- Target: `flexnetos-vs-lifeos`
- Generated: `2026-07-28T11:48:19+00:00`
- VER-300 entry status: `ready_with_open_runtime_gates`
- Covered classes: `6` / `6`

## Dependency Status

| dependency | status |
| --- | --- |
| `REQ-024_ENVCTL_ARTIFACT_REGISTRY` | `completed` |
| `REQ-040_SHARED_PROTOCOL_SCHEMAS` | `completed` |
| `REQ-025_ENVCTL_VALIDATION_EVIDENCE` | `completed` |
| `REQ-033_PLUGIN_HUMAN_APPROVAL` | `completed` |
| `REQ-041_TWO_REPO_INTEGRATION` | `completed` |
| `REQ-045_RUN_REPLAY` | `completed` |

## Coverage Rows

| class | scope | automation | readiness | owner |
| --- | --- | --- | --- | --- |
| `unit` | envctl database schema, views, validators, artifact registry, validation evidence, operation state, and shared protocol sample records | `ready` | `covered_for_ver300_entry` | `validation-agent` |
| `integration` | envctl database to nu_plugin shared protocol boundary for targets, runs, operations, status streams, artifacts, approvals, graph, and validation rows | `partial` | `protocol_ready_runtime_pairing_required` | `validation-agent` |
| `regression` | artifact contract paths, proof ledger, task graph packets, registry hashes, and reusable generated reports across repeated package runs | `ready` | `covered_for_artifact_replay_checks` | `validation-agent` |
| `performance` | SQLite migration application, artifact registration throughput, proof/status rebuild, and plugin status stream responsiveness | `planned` | `baseline_required` | `validation-agent` |
| `security` | blocked path policy, redaction controls, approval gates, command redaction, hash coverage, sandbox boundaries, and reproducibility identity | `partial` | `controls_ready_approval_and_replay_pending` | `security-reproducibility-agent` |
| `UAT` | operator-facing migration workflow for target intake, package import, run planning, approvals, live status, artifact review, proof review, replay, and handoff | `planned` | `uat_script_ready_human_run_required` | `artifact-agent` |

## Required Checks

### unit
- apply SQL migrations to an isolated SQLite database
- validate target, recipe, run event, operation, artifact, evidence, validation, replay, and proof record schemas
- exercise artifact registry path, hash, producer, contract, provenance, validation link, and fail-closed cases
- exercise validation evidence rows for reconciliation, parity, test results, and proof evidence

Open gaps:
- Replay and rollback dependencies are complete; runtime execution remains tracked by VER-300.

### integration
- create a run in envctl and read it through the plugin-shaped shared protocol records
- append operation events and confirm timeline/status rows are visible to the operator surface
- list artifact records with hashes, evidence IDs, and graph links through the shared protocol shape
- verify approval and replay status are represented as structured records when backing gates exist

Open gaps:
- Two-repository integration dependency is complete; the live runtime pair remains a VER-300 execution gate.

### regression
- re-run generation for completed artifact tasks and verify path/hash stability or intentional proof updates
- validate execution packets against task graph and schema contracts
- rebuild status from proof ledger and confirm completed tasks remain queryable
- detect stale or missing canonical contract paths in migration-artifacts

Open gaps:
- Replay dependency is complete; regression replay execution remains tracked by VER-300 and later release checks.

### performance
- time migration application and registry insertion for representative artifact batches
- time status/proof rebuild against the proof ledger and generated task graph
- set a baseline for plugin status and live visual reads over fixture data
- record acceptable thresholds before release validation begins

Open gaps:
- No timing baseline artifact exists yet for migration DB, registry, or plugin status commands.

### security
- reject blocked evidence paths including .env, secrets, private_keys, pem, and key files
- verify redaction controls and filesystem boundaries before any target write
- confirm risky operations require approval and mutating plugin commands remain auditable
- ensure generated artifacts and evidence rows carry SHA-256 hashes

Open gaps:
- Approval and replay dependencies are complete; end-to-end runtime security execution remains tracked by VER-300.

### UAT
- walk the operator session template using fixture target and recipe records
- confirm live visual/status screens expose blockers, approvals, artifacts, validations, and proof URIs
- review generated migration-artifacts index paths and canonical testing-validation artifacts
- capture human signoff criteria and unresolved blockers before release handoff

Open gaps:
- Human approval support is completed; replay support is completed.

## Evidence Inputs

| input | sha256 |
| --- | --- |
| `examples/target-descriptors/flexnetos-vs-lifeos.yaml` | `71f4aab77e91d0fa9a414350dee50f23fc3c6492b265c607fe9e4de93c3fe190` |
| `execution-framework/generated/package_scan.json` | `3694a6122897f3e11f11a60dbebe8514aa2a6e5e508a6d352324f45da9cc7159` |
| `execution-framework/generated/envctl_migration_db_model.json` | `229c620f010631accc83df3157e2e0186aad4ac6baf4304acd7ac6ac722c6644` |
| `execution-framework/generated/envctl_artifact_registry_report.json` | `1a85fa85eb1a4e0e7affb161b693c3f06db8a52bf7b446b031b285138186cacf` |
| `execution-framework/generated/envctl_validation_evidence_report.json` | `c4694be4cdab69be79be88e5ee92cf8f4be86d53445d096f8562e036673b4bf5` |
| `execution-framework/generated/shared_protocol_validation_report.json` | `305a43adc1b91d4c1cc96f157e33031a8a01176ede6138692bf0301d90b63fe0` |
| `execution-framework/generated/status_from_proofs.json` | `28e0f0d09ea6606042ed229e66c634410efedd335f9d2141bf674637d279f595` |
| `execution-framework/generated/contract_manifest.json` | `ae87ddcf893f85a5376704192428173e168fa5c0d30238994d97ddc1c6a1bed5` |

## Verification Entrypoints

- `python3 scripts/verify_envctl_db_schema.py`
- `python3 scripts/verify_artifact_registry.py`
- `python3 scripts/verify_validation_evidence.py`
- `python3 scripts/verify_shared_protocol_schemas.py`
- `python3 scripts/verify_security_redaction.py`
- `python3 scripts/verify_filesystem_boundaries.py`
- `VER-300_UNIT_VALIDATION`

## Contract Mapping

- Contract row: `artifact:06-testing-validation-test-coverage-matrix-md`
- Canonical path: `migration-artifacts/06-testing-validation/test-coverage-matrix.md`
- Task-scoped MD: `migration-artifacts/art-124_test_coverage/test-coverage-matrix.md`
- Task-scoped JSON: `migration-artifacts/art-124_test_coverage/test-coverage-matrix.json`

## Interpretation

The matrix covers unit, integration, regression, performance, security, and UAT. Unit, regression, and core control-plane security have concrete package evidence; integration, performance, end-to-end security, replay, and UAT remain explicit VER-300 or later execution gates where live runtime evidence is still pending.
