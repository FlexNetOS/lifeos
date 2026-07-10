# NBSOURCE-010: Edge Node Deployment and Agent Swarm Initialization

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `128d9867-01e7-4415-a711-c748f52c507d`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `aa90a47f25fcb9eabd76274d3e42dae9d0ef29098a3e59c65e52fb1885196e78`
- Source bytes / logical lines: `874` / `17`
- Packet validation: `pass` (`/home/flexnetos/meta/var/tmp/notebooklm-parallel/NBSOURCE-010/validation.json`)
- Evidence boundary: the indexed source proves only that these statements or questions were present; it does not prove implementation, performance, authority, or readiness.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `EDGEDEP-CLAIM-001` | `architecture-proposal` | Phase 2 deploys an agent swarm to local edge hardware through three milestones: Foundation Engine, Agent Deployment, and The Scratchpad. | `FOUNDATION-001`; `FOUNDATION-003`; `LIFEOS-005`; `POSTGRES-009` |
| `EDGEDEP-CLAIM-002` | `current-implementation-claim` | ruvllm is initialized on the edge nodes. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-006` |
| `EDGEDEP-CLAIM-003` | `architecture-proposal` | A single frozen foundation model is kept loaded in shared memory on the edge nodes. | `FOUNDATION-001`; `POSTGRES-006`; `PGAUTH-003` |
| `EDGEDEP-CLAIM-004` | `performance-claim` | Keeping one foundation model in shared memory conserves VRAM. | `FOUNDATION-001`; `POSTGRES-006` |
| `EDGEDEP-CLAIM-005` | `current-implementation-claim` | Individual agents are deployed using AgentDB .rvf files. | `PGAUTH-003`; `POSTGRES-006`; `LIFEOS-005` |
| `EDGEDEP-CLAIM-006` | `engine-fact` | AgentDB .rvf files contain custom MicroLoRA adapters. | `PGAUTH-003`; `POSTGRES-006` |
| `EDGEDEP-CLAIM-007` | `performance-claim` | MicroLoRA adapters hot-swap into the base model in milliseconds. | `PGAUTH-003`; `POSTGRES-006` |
| `EDGEDEP-CLAIM-008` | `application-claim` | Hot-swapped adapters give each agent a unique personality and skill set. | `PGAUTH-003`; `POSTGRES-006`; `LIFEOS-005` |
| `EDGEDEP-CLAIM-009` | `architecture-proposal` | redb is configured as an ultra-fast local AI scratchpad for agent state. | `PGAUTH-002`; `STORE-001`; `POSTGRES-006` |
| `EDGEDEP-CLAIM-010` | `performance-claim` | Agents rapidly log high-frequency state changes and thoughts to redb without network lag. | `PGAUTH-002`; `PGAUTH-006`; `STORE-001`; `POSTGRES-006` |
| `EDGEDEP-CLAIM-011` | `source-provenance-claim` | Citation markers [1] through [4] are present but their referenced documents or exact passages are absent from the indexed source. | `NBVERIFY-000`; `PGAUTH-002`; `PGAUTH-003`; `POSTGRES-006` |
| `EDGEDEP-QUESTION-001` | `question-claim` | The source asks whether to move on to Phase 3 In-Place Refactoring and Immune Defense. | `LIFEOS-003`; `POSTGRES-005`; `POSTGRES-010` |
| `EDGEDEP-QUESTION-002` | `question-claim` | The source asks whether to examine how AgentDB RVF files work. | `PGAUTH-003`; `POSTGRES-006`; `NBVERIFY-000` |

## Classification counts

- `application-claim`: 1
- `architecture-proposal`: 3
- `current-implementation-claim`: 2
- `engine-fact`: 1
- `performance-claim`: 3
- `question-claim`: 2
- `source-provenance-claim`: 1

## Resolution boundary

- All 13 atoms remain unresolved and are queued for their recorded primary-evidence, benchmark, or owner-decision method.
- Questions remain questions and grant no execution, deployment, initialization, phase-transition, or architecture authority.
- Repetition and relation to earlier NotebookLM claims are evidence of relationship only, never verification.
- No raw external fulltext is duplicated here merely for provenance; packet identity and the exact source checksum preserve the source boundary.
