# IAM Security Access Matrix

Task: `ART-117_IAM_MATRIX`
Generated at: `2026-07-27T21:23:17+00:00`
Status: `complete`
Target: `flexnetos-vs-lifeos` (mixed)
Contract row: `artifact:09-governance-iam-security-access-matrix-md`

## Scope

This canonical governance artifact summarizes IAM/security principals and controls captured in the task-local matrix:

- `migration-artifacts/art-117_iam_matrix/iam-security-access-matrix.md`
- `migration-artifacts/art-117_iam_matrix/iam-security-access-matrix.json`

## Access Matrix (Governance View)

| principal | type | authority | risk |
|---|---|---|---|
| `human:migration-operator` | user | Approval-gated human control for plans, artifact review, and operation approvals | medium |
| `agent:artifact-agent` | agent | Workspace-write artifact generator for task-local and registration outputs | low |
| `service:envctl-migration-db` | service | Control-plane persistence for targets, packages, contracts, runs, operations, validations, approvals, and rollback metadata | medium |
| `service:target-filesystem-collector` | service | Discovery collector with blocked-path safe reads and scan evidence production | low |
| `plugin:nu_plugin-operator-surface` | plugin | Human-facing control/status commands for start/list/approve and replay surfaces | medium |
| `agent:spark-security-reproducibility` | agent | Security/reproducibility design and review helpers | low |
| `external:github-integration` | external_integration | External collaboration artifacts prepared without persisting token values | medium |

## Credentials, Certificates, and Tokens

| item | type | status | storage / control |
|---|---|---|---|
| `blocked-path-policy` | secret_path_policy | enforced | policy-only exclusion for `.env`, `secrets/`, `private_keys/`, `*.pem`, `*.key` |
| `command-redaction` | redaction_control | modeled | `envctl_migration_operations.command_redacted` |
| `token-references` | token_reference | references-only | redacted source signal list |
| `certificate-key-material` | certificate_or_key | not collected | no key/certificate blobs persisted |

## Evidence Notes

- Task-local evidence and matrix source signals remain in redacted form.
- The task proof record links both task-local outputs and this governance canonical artifact.

## Registry Contract

This artifact is the required canonical governance path for:

- `artifact:09-governance-iam-security-access-matrix-md`
- required path `migration-artifacts/09-governance/iam-security-access-matrix.md`

