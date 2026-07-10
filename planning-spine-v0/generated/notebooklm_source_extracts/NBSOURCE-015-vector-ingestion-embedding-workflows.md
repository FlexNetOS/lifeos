# NBSOURCE-015: Orchestrating Vector Ingestion and Embedding Workflows

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `5d060f76-549f-476c-b7ab-13726c3911a4`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `d442e53ebeeb83ff3440bc0fa9f1599f0bcfbbb2c920bdff62f27e2e9651a259`
- Source bytes / logical lines: `1012` / `12`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `VECTORFLOW-CLAIM-001` | `engine-fact` | The database itself does not generate embeddings during ingestion. | `PGAUTH-001`; `POSTGRES-005`; `POSTGRES-006` |
| `VECTORFLOW-CLAIM-002` | `engine-fact` | The database stores and measures embeddings during ingestion. | `PGAUTH-001`; `POSTGRES-005`; `POSTGRES-006` |
| `VECTORFLOW-CLAIM-003` | `current-implementation-claim` | The system uses a local lightweight embedding model, such as all-MiniLM-L6-v2, inside a bare-metal Rust binary through an inference framework. | `FOUNDATION-001`; `ADOPT-001`; `POSTGRES-005`; `POSTGRES-006` |
| `VECTORFLOW-CLAIM-004` | `current-implementation-claim` | envctl acts as the bridge for the embedding process. | `RECOVERY-003`; `ADOPT-002`; `PGAUTH-006`; `POSTGRES-006` |
| `VECTORFLOW-CLAIM-005` | `current-implementation-claim` | envctl pulls parsed structured code blocks from a redb buffer. | `RECOVERY-002`; `ADOPT-001`; `ADOPT-002`; `PGAUTH-002`; `PGAUTH-006`; `STORE-001`; `POSTGRES-004`; `POSTGRES-006` |
| `VECTORFLOW-CLAIM-006` | `current-implementation-claim` | envctl passes parsed code blocks through the local embedding model to translate text into high-dimensional vectors. | `ADOPT-001`; `ADOPT-002`; `POSTGRES-005`; `POSTGRES-006` |
| `VECTORFLOW-CLAIM-007` | `current-implementation-claim` | envctl permanently commits both code and vectors into PostgreSQL. | `PGAUTH-001`; `PGAUTH-002`; `PGAUTH-006`; `ADOPT-002`; `STORE-001`; `POSTGRES-004`; `POSTGRES-005`; `POSTGRES-006` |
| `VECTORFLOW-CLAIM-008` | `current-implementation-claim` | redb hashes text as a deduplication cache. | `PGAUTH-002`; `PGAUTH-006`; `STORE-001`; `POSTGRES-004`; `POSTGRES-006` |
| `VECTORFLOW-CLAIM-009` | `performance-claim` | The deduplication cache ensures inference is never recomputed for the exact same code block. | `PGAUTH-002`; `PGAUTH-006`; `POSTGRES-005`; `POSTGRES-006` |
| `VECTORFLOW-CLAIM-010` | `question-claim` | The closing question asks whether to review Copy-On-Write database branching for concurrent agent edits. | `LIFEOS-003`; `POSTGRES-003`; `POSTGRES-005`; `POSTGRES-010` |
| `VECTORFLOW-CLAIM-011` | `source-provenance-claim` | Citation markers [1] through [7] appear, but the indexed fulltext includes neither their source documents nor exact passages. | `NBVERIFY-000`; `PGAUTH-002`; `POSTGRES-005`; `POSTGRES-006` |

## Classification counts

- `current-implementation-claim`: 6
- `engine-fact`: 2
- `performance-claim`: 1
- `question-claim`: 1
- `source-provenance-claim`: 1

## Resolution boundary

- All 11 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Closing prompts remain questions and grant no build, deployment, initialization, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
