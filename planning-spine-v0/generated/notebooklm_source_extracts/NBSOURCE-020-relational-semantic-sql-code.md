# NBSOURCE-020: Relational Synthesis: Code Manipulation via Semantic SQL Queries

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `29a4bf59-2173-42fd-b2e2-d3f0143f1b0c`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `ede1acf90a1688f3113e0ae2c1c367e6d9d830d485d4e20afcb3618effb152e3`
- Source bytes / logical lines: `768` / `10`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `REL-CLAIM-001` | `current-implementation-claim` | The source asserts that agents execute semantic graph queries by combining standard SQL with RuVector hybrid search. | `LIFEOS-003`; `POSTGRES-005`; `POSTGRES-007` |
| `REL-CLAIM-002` | `engine-fact` | The source presents an ORDER BY semantic_embedding <->-like expression as part of semantic function retrieval. | `ADOPT-002`; `POSTGRES-005` |
| `REL-CLAIM-003` | `performance-claim` | The source claims that semantic retrieval instantly identifies the exact functions an agent needs to modify, rather than locating them by file path. | `LIFEOS-003`; `POSTGRES-005`; `POSTGRES-009` |
| `REL-CLAIM-004` | `current-implementation-claim` | The source asserts that agents query dependency columns to trace function interactions across the operating system. | `LIFEOS-003`; `POSTGRES-002`; `POSTGRES-005` |
| `REL-CLAIM-005` | `current-implementation-claim` | The source asserts that an agent rewrites selected code directly in database rows through standard SQL UPDATE statements. | `POSTGRES-003`; `POSTGRES-005`; `POSTGRES-010` |
| `REL-PROPOSAL-001` | `architecture-proposal` | The source introduces, only in question-scoped form, a proposed database-hosted-code to envctl materialization to file-directory-to-compilation pipeline. | `POSTGRES-008`; `POSTGRES-009`; `RELEASE-002` |
| `REL-QUESTION-001` | `question-claim` | The source asks whether the envctl materialization and final-compilation path should be reviewed. | `FOUNDATION-003`; `POSTGRES-008`; `POSTGRES-009`; `RELEASE-002` |
| `REL-PROVENANCE-001` | `source-provenance-claim` | Citation markers [1] and [2] are unresolved within the retrieved source and therefore verify none of its associated semantic, dependency, or direct-update assertions. | `NBVERIFY-000`; `POSTGRES-005` |

## Classification counts

- `architecture-proposal`: 1
- `current-implementation-claim`: 3
- `engine-fact`: 1
- `performance-claim`: 1
- `question-claim`: 1
- `source-provenance-claim`: 1

## Resolution boundary

- All 8 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Questions remain questions and grant no build, deployment, phase, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
