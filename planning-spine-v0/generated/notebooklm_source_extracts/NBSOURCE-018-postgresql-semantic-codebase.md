# NBSOURCE-018: PostgreSQL Semantic Codebase Management

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `b1e48fb2-6229-41cc-b96e-384e7afbb02a`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `ceb68e682d764633b1064f62078da8fed5998d5aeb35d0d9f5ee403ddf7b4fce`
- Source bytes / logical lines: `756` / `4`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `PGSCM-CLAIM-001` | `architecture-proposal` | The source proposes PostgreSQL as the host for the codebase. | `POSTGRES-002`; `POSTGRES-003`; `POSTGRES-010` |
| `PGSCM-CLAIM-002` | `performance-claim` | Hosting the codebase in PostgreSQL completely eliminates the need to load a massive codebase into an AI agent prompt context. | `POSTGRES-004`; `POSTGRES-005`; `POSTGRES-009` |
| `PGSCM-CLAIM-003` | `current-implementation-claim` | The source asserts that an agent uses standard SQL and RuVector to query and retrieve only the exact functions needed for an edit. | `POSTGRES-005` |
| `PGSCM-CLAIM-004` | `current-implementation-claim` | The source asserts that retrieval includes the specific structs on which the selected functions depend. | `POSTGRES-002`; `POSTGRES-004`; `POSTGRES-005` |
| `PGSCM-CLAIM-005` | `architecture-proposal` | The source characterizes the database arrangement as a semantic IDE for AI developers. | `POSTGRES-005`; `POSTGRES-007`; `LIFEOS-003` |
| `PGSCM-PROVENANCE-001` | `source-provenance-claim` | The retrieved source uses citation marker [1] but supplies neither a bibliography nor the referenced passage. | `NBVERIFY-000`; `POSTGRES-005` |
| `PGSCM-QUESTION-001` | `question-claim` | The source asks whether to review embedding generation for code blocks during ingestion. | `POSTGRES-004`; `POSTGRES-005` |

## Classification counts

- `architecture-proposal`: 2
- `current-implementation-claim`: 2
- `performance-claim`: 1
- `question-claim`: 1
- `source-provenance-claim`: 1

## Resolution boundary

- All 7 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Closing prompts remain questions and grant no build, deployment, initialization, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
