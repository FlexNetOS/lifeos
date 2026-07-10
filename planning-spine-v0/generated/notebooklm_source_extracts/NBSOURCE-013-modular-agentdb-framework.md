# NBSOURCE-013: Modular Intelligence: The Ruvnet AgentDB Framework

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `f67e503d-2b04-4c38-9b4c-f5bb069d3d59`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `a46802faea7ec300de13154f7e40ec229da9424bdff1e05ba03e55a067095d12`
- Source bytes / logical lines: `1200` / `17`
- Packet validation: `pass`
- Evidence boundary: source wording is not implementation, benchmark, authority, readiness, or citation proof.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `AGENTDB-CLAIM-001` | `current-implementation-claim` | The source asserts that each Ruvnet agent is deployed as one self-contained AgentDB .rvf file. | `PGAUTH-003`; `POSTGRES-006`; `LIFEOS-005` |
| `AGENTDB-CLAIM-002` | `application-claim` | The source characterizes each AgentDB .rvf file as a lightweight cognitive container. | `PGAUTH-003`; `POSTGRES-006`; `STORE-001` |
| `AGENTDB-CLAIM-003` | `current-implementation-claim` | The source asserts that AgentDB containers run over one frozen foundation model hosted by ruvllm on edge nodes. | `FOUNDATION-001`; `FOUNDATION-003`; `LIFEOS-005`; `POSTGRES-006` |
| `AGENTDB-CLAIM-004` | `application-claim` | The source asserts that each .rvf gives an agent distinct skills and personality through MicroLoRA adapter weights. | `PGAUTH-003`; `POSTGRES-006`; `STORE-001` |
| `AGENTDB-CLAIM-005` | `performance-claim` | The source claims MicroLoRA adapters hot-swap into the base model in milliseconds. | `POSTGRES-006`; `LIFEOS-005`; `NBVERIFY-000` |
| `AGENTDB-CLAIM-006` | `application-claim` | The source asserts that SONA tracks an agent's successes and failures. | `PGAUTH-003`; `POSTGRES-006`; `LIFEOS-003` |
| `AGENTDB-CLAIM-007` | `application-claim` | The source asserts that SONA automatically adjusts agent behavior to avoid repeating mistakes. | `PGAUTH-003`; `POSTGRES-006`; `LIFEOS-003`; `STORE-001` |
| `AGENTDB-CLAIM-008` | `application-claim` | The source asserts that FastGRNN routing is a lightweight graph of agent memory that pre-filters what the LLM needs to focus on. | `PGAUTH-003`; `POSTGRES-006`; `POSTGRES-005`; `STORE-001` |
| `AGENTDB-CLAIM-009` | `performance-claim` | The source claims that 50 unique agents can use the hardware footprint of one base model because of the modular structure. | `FOUNDATION-001`; `LIFEOS-005`; `POSTGRES-006`; `NBVERIFY-000` |
| `AGENTDB-CLAIM-010` | `source-provenance-claim` | The source uses citation markers [1] through [7], but the indexed fulltext supplies neither source documents nor exact supporting passages. | `NBVERIFY-000`; `PGAUTH-003`; `POSTGRES-006` |
| `AGENTDB-QUESTION-001` | `question-claim` | The source asks whether the final workspace is ready to initialize or whether AgentDB-container questions remain before beginning. | `FOUNDATION-003`; `PGAUTH-003`; `POSTGRES-006`; `POSTGRES-009`; `RELEASE-002` |

## Classification counts

- `application-claim`: 5
- `current-implementation-claim`: 2
- `performance-claim`: 2
- `question-claim`: 1
- `source-provenance-claim`: 1

## Resolution boundary

- All 11 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- The closing readiness alternative remains a question and grants no initialization or execution authority.
- Repetition records relationships only and verifies no prior or current claim.
- Raw external fulltext is not duplicated merely for provenance.
