# NBSOURCE-030: The Three Pillars of Code Ingestion

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `aa7c6940-c8a9-4a26-8120-7f9092f6db08`
- Object type: `markdown`
- Source SHA-256: `5be7cc69c29db15c613ba3ed58c0025fcb75e805701a51f9a49c68498532dec9`
- Source bytes / logical lines: `810` / `1`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `INGEST-CLAIM-001` | `current-implementation-claim` | The source asserts that Nushell traverses a workspace and parses raw files into ASTs that map functions, structs, and dependencies. | `FOUNDATION-001`; `PGAUTH-001`; `ADOPT-001` |
| `INGEST-CLAIM-002` | `current-implementation-claim` | The source asserts that nu_plugin receives structured blocks and writes them to a local redb cache. | `PGAUTH-001`; `PGAUTH-002`; `ADOPT-001`; `STORE-001` |
| `INGEST-CLAIM-003` | `current-implementation-claim` | The source asserts that envctl reads blocks from redb, generates code-semantic vector embeddings, and commits the result into PostgreSQL. | `POSTGRES-004`; `POSTGRES-005`; `POSTGRES-006`; `POSTGRES-008`; `POSTGRES-009`; `PGAUTH-004` |
| `INGEST-CLAIM-004` | `architecture-proposal` | The source frames Phase 1 ingestion as a three-step pipeline from flat files to a database-hosted codebase. | `FOUNDATION-001`; `POSTGRES-004`; `POSTGRES-008`; `LIFEOS-011` |
| `INGEST-CLAIM-005` | `architecture-proposal` | The source proposes conversion of flat files into a database-hosted representation of a codebase. | `POSTGRES-004`; `POSTGRES-008`; `POSTGRES-009`; `PGAUTH-004` |
| `PERF-CLAIM-001` | `performance-claim` | The source claims that the nu_plugin write into the local redb cache has microsecond latency. | `PGAUTH-002`; `STORE-001`; `POSTGRES-004` |
| `AUTH-CLAIM-001` | `authority-claim` | The source implies that envctl is the synchronizing writer and PostgreSQL is the permanent destination for ingested blocks. | `PGAUTH-001`; `PGAUTH-004`; `POSTGRES-006`; `POSTGRES-008`; `POSTGRES-009` |
| `QUESTION-CLAIM-001` | `question-claim` | The source asks whether to proceed to Phase 2 or inspect configuration of an ingestion tool. | `LIFEOS-011`; `NBVERIFY-000` |
| `PROVENANCE-CLAIM-001` | `source-provenance-claim` | The retrieved object is a NotebookLM markdown source titled The Three Pillars of Code Ingestion. | `NBVERIFY-000` |

## Classification counts

- `architecture-proposal`: 2
- `authority-claim`: 1
- `current-implementation-claim`: 3
- `performance-claim`: 1
- `question-claim`: 1
- `source-provenance-claim`: 1

## Resolution boundary

- All 9 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Questions remain questions and grant no build, deployment, phase, test, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
