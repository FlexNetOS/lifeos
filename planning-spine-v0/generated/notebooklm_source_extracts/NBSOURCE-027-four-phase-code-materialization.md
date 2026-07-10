# NBSOURCE-027: The Four Phases of Database Code Materialization

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `a0b971e6-c831-483f-805e-353ee9f14cf6`
- Object type: `markdown`
- Source SHA-256: `d9c64c3371518ae6f42d1067bbcc0ff77ff87f54301d80ab9b3989646f4cba96`
- Source bytes / logical lines: `860` / `15`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `MAT-CLAIM-001` | `current-implementation-claim` | The source asserts that envctl converts database-hosted code into a standard file directory for compilation. | `POSTGRES-008`; `POSTGRES-009`; `ADOPT-001` |
| `MAT-CLAIM-002` | `architecture-proposal` | The source frames its proposed materialization process as four steps. | `POSTGRES-008`; `POSTGRES-009`; `LIFEOS-011` |
| `MAT-CLAIM-003` | `current-implementation-claim` | The source asserts that envctl queries PostgreSQL for a final production branch. | `POSTGRES-007`; `POSTGRES-008`; `PGAUTH-004` |
| `MAT-CLAIM-004` | `current-implementation-claim` | The source asserts that stored module_path metadata reconstructs the exact directory structure in memory. | `POSTGRES-008`; `PGAUTH-004`; `ADOPT-001` |
| `MAT-CLAIM-005` | `current-implementation-claim` | The source asserts that raw code blocks are combined into complete standard files, including .rs or .toml examples. | `POSTGRES-008`; `POSTGRES-009`; `ADOPT-001` |
| `MAT-CLAIM-006` | `current-implementation-claim` | The source asserts that the clean directory is handed to a Nix or Yazelix build environment for final compilation. | `FOUNDATION-003`; `POSTGRES-008`; `POSTGRES-009` |
| `MAT-CLAIM-007` | `integrity-claim` | The source claims that the described flow completes the lifecycle from database ingestion to portable release. | `POSTGRES-004`; `POSTGRES-008`; `POSTGRES-009`; `LIFEOS-011`; `RELEASE-002` |
| `MAT-CLAIM-008` | `architecture-proposal` | The source asserts that the core architecture phases have been covered. | `LIFEOS-011`; `POSTGRES-008`; `POSTGRES-009`; `RELEASE-002` |
| `MAT-CLAIM-009` | `question-claim` | The source asks whether to review an asserted database approach to AI context window limits. | `POSTGRES-004`; `POSTGRES-005`; `NBVERIFY-000` |
| `MAT-CLAIM-010` | `question-claim` | The source asks the reader to choose another system topic. | `NBVERIFY-000`; `POSTGRES-008`; `POSTGRES-009` |
| `MAT-CLAIM-011` | `source-provenance-claim` | The retrieved source contains citation markers [1, 2] without recoverable citation provenance in its fulltext. | `NBVERIFY-000`; `POSTGRES-008`; `POSTGRES-009` |

## Classification counts

- `architecture-proposal`: 2
- `current-implementation-claim`: 5
- `integrity-claim`: 1
- `question-claim`: 2
- `source-provenance-claim`: 1

## Resolution boundary

- All 11 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Questions remain questions and grant no build, deployment, phase, test, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
