# NBSOURCE-031: The envctl Projection Engine: From Database to Directory

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `e4d7e6e0-7882-41d4-93cd-631d2b646da5`
- Object type: `markdown`
- Source SHA-256: `26779f9766b49a775a56fdf33ae1ef1d55134179923876a62e0d430cfe3588b6`
- Source bytes / logical lines: `752` / `16`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `ENVPROJ-CLAIM-001` | `architecture-proposal` | envctl materializes database-hosted code into a standard file directory through a four-step projection process. | `POSTGRES-008`; `POSTGRES-009` |
| `ENVPROJ-CLAIM-002` | `authority-claim` | envctl queries PostgreSQL for a final production branch before projection. | `PGAUTH-001`; `POSTGRES-005`; `POSTGRES-008` |
| `ENVPROJ-CLAIM-003` | `current-implementation-claim` | envctl uses stored module_path metadata to reconstruct the exact directory structure in memory. | `ADOPT-001`; `ADOPT-002`; `STORE-001`; `POSTGRES-008` |
| `ENVPROJ-CLAIM-004` | `current-implementation-claim` | envctl concatenates raw_code blocks into complete standard files, including Rust and TOML files. | `ADOPT-001`; `ADOPT-002`; `STORE-001`; `POSTGRES-008` |
| `ENVPROJ-CLAIM-005` | `architecture-proposal` | envctl hands the projected directory to a Nix or Yazelix build environment for final compilation. | `FOUNDATION-003`; `POSTGRES-008`; `POSTGRES-009` |
| `ENVPROJ-CLAIM-006` | `question-claim` | The source asks whether to test the described workflow or revisit a phase. | `NBVERIFY-000`; `POSTGRES-009` |
| `ENVPROJ-CLAIM-007` | `source-provenance-claim` | The retrieved source uses citation markers [1] and [2] without providing the referenced documents or exact passages. | `NBVERIFY-000`; `POSTGRES-008` |

## Classification counts

- `architecture-proposal`: 2
- `authority-claim`: 1
- `current-implementation-claim`: 2
- `question-claim`: 1
- `source-provenance-claim`: 1

## Resolution boundary

- Local-primary truth testing is complete: `2` verified, `2` qualified, and `3` refuted; `0` remain queued.
- Claim-level findings and exact commands are recorded in `generated/notebooklm_claim_verification/NBVERIFY-030-032.local-evidence.json`.
- Closure classifies source truth only; qualified or refuted claims grant no product, store-authority, build, phase, or runtime execution permission.
- Repetition remains relationship evidence only and verifies no claim.
