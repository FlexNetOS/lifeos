# NBSOURCE-019: Proportional Intelligence and Task Routing in RuvLTRA

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `1b6f53c5-4065-4a3d-b0ea-4c3ea1b74365`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `0587b245c0a4bd1e02d4290427b7822442269073abd3accc43345fee00879aad`
- Source bytes / logical lines: `934` / `6`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `NBS019-ROUTING-001` | `current-implementation-claim` | RuvLTRA routes tasks using a concept called Proportional Intelligence. | `POSTGRES-006`; `INTEL-002` |
| `NBS019-ROUTING-002` | `current-implementation-claim` | RuvLTRA analyzes an incoming task's complexity and automatically routes it to the most efficient model. | `POSTGRES-006`; `INTEL-002`; `POSTGRES-007`; `STORE-001` |
| `NBS019-MODEL-001` | `current-implementation-claim` | The source gives quick syntax fixes as an example of work sent to fast, lightweight models such as Claude Haiku or a local ruvllm node. | `INTEL-002`; `POSTGRES-006` |
| `NBS019-MODEL-002` | `current-implementation-claim` | The source gives massive architectural decisions or security validations as examples of work escalated to cloud models such as Claude Opus or GPT-4. | `INTEL-002`; `STORE-001`; `POSTGRES-006` |
| `NBS019-TIMELINE-001` | `current-implementation-claim` | RuvLTRA reviews parallel future timelines simulated by the system. | `POSTGRES-005`; `LIVING-002`; `STORE-001` |
| `NBS019-TIMELINE-002` | `current-implementation-claim` | RuvLTRA automatically steers the swarm toward the most mathematically stable and successful path. | `POSTGRES-005`; `POSTGRES-006`; `LIVING-002`; `STORE-001` |
| `NBS019-PROVENANCE-001` | `source-provenance-claim` | The retrieved fulltext contains citation markers [1], [2], and [3] without their referenced documents or exact passages. | `NBVERIFY-000` |
| `NBS019-CLOSING-001` | `question-claim` | The source closes by asking whether to build the described components or review another architecture area; that closing question is not implementation evidence or owner authorization. | `NBVERIFY-000`; `STORE-001` |

## Classification counts

- `current-implementation-claim`: 6
- `question-claim`: 1
- `source-provenance-claim`: 1

## Resolution boundary

- All 8 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Questions remain questions and grant no build, deployment, phase, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
