# Test Coverage Matrix

- Task: `ART-124_TEST_COVERAGE`
- Target: `flexnetos-vs-lifeos`
- Generated: `2026-07-27T21:39:17+00:00`
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
- Replay and rollback unit checks remain pending until REQ-026, REQ-027, and REQ-045 complete.

### integration
- create a run in envctl and read it through the plugin-shaped shared protocol records
- append operation events and confirm timeline/status rows are visible to the operator surface
- list artifact records with hashes, evidence IDs, and graph links through the shared protocol shape
- verify approval and replay status are represented as structured records when backing gates exist

Open gaps:
- REQ-041_TWO_REPO_INTEGRATION is pending, so this matrix does not certify a live envctl-to-nu_plugin run.

### regression
- re-run generation for completed artifact tasks and verify path/hash stability or intentional proof updates
- validate execution packets against task graph and schema contracts
- rebuild status from proof ledger and confirm completed tasks remain queryable
- detect stale or missing canonical contract paths in migration-artifacts

Open gaps:
- Full replay identity remains pending until REQ-045_RUN_REPLAY is complete.

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
- REQ-033_PLUGIN_HUMAN_APPROVAL and REQ-045_RUN_REPLAY are pending, so end-to-end approval/replay security is not certified here.

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
| `execution-framework/generated/package_scan.json` | `9072d7f7537e6a876321e4efff4b87c3a1f06278689881166cb8d9180b913a73` |
| `execution-framework/generated/envctl_migration_db_model.json` | `53942087cf05d40c288f9e12701ed30d982d661084731b3e47cf0f8397ec200a` |
| `execution-framework/generated/envctl_artifact_registry_report.json` | `d008800edcc5eaea83ae79b045ff3fc3a0e61d16556e254631d892aa0f476c62` |
| `execution-framework/generated/envctl_validation_evidence_report.json` | `6e6b802356a9b7858583e201a4f597264f55ad27735f355d85668340a3afc2fe` |
| `execution-framework/generated/shared_protocol_validation_report.json` | `117062e337a85610d1122309984e8c763a14ce88d4e6ee51de345b9f121122f2` |
| `execution-framework/generated/status_from_proofs.json` | `16d5edfea4aa4ee2c138f07cc75ec9c2d4127a409a846d5c0ceb77967319cf5f` |
| `execution-framework/generated/contract_manifest.json` | `2f6efd26d5dc2dda57d6bedf923ead6c5ed1dec55d72214455878d657e60e0f0` |

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
