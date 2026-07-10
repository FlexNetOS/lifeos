# NBSOURCE-022: RuVector MinCut: Deterministic Swarm Integrity and Logic Isolation

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `93a03b0c-24b2-4b2d-9782-f34c1eb58797`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `c484145937c36ffed57b2f21dc0250ccbb87c0ff0fcdd840bf83f13337ca02ed`
- Source bytes / logical lines: `843` / `4`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `MINCUT-CLAIM-001` | `current-implementation-claim` | The source presents agent communications and code dependencies as one mathematical graph consumed by RuVector MinCut. | `LIFEOS-003`; `POSTGRES-005` |
| `MINCUT-CLAIM-002` | `current-implementation-claim` | The source asserts that RuVector MinCut continuously monitors the graph. | `LIFEOS-003`; `POSTGRES-005` |
| `MINCUT-CLAIM-003` | `performance-claim` | The source characterizes monitoring or MinCut identification as subpolynomial-time performance. | `POSTGRES-005`; `POSTGRES-009` |
| `MINCUT-CLAIM-004` | `engine-claim` | The source asserts that the MinCut operation identifies minimum cuts in the supplied graph. | `POSTGRES-005` |
| `MINCUT-CLAIM-005` | `application-claim` | The source maps graph minimum cuts to weakest links in swarm logic. | `LIFEOS-003`; `POSTGRES-005`; `LPS-005` |
| `MINCUT-CLAIM-006` | `current-implementation-claim` | The source asserts that corrupted or hallucinated agent output causes a measurable weakening of that agent's graph connection. | `LIFEOS-003`; `POSTGRES-005`; `LPS-005` |
| `MINCUT-CLAIM-007` | `performance-claim` | The source claims instant weakening of the graph connection after corrupted or hallucinated output begins. | `POSTGRES-005`; `POSTGRES-009` |
| `MINCUT-CLAIM-008` | `current-implementation-claim` | The source asserts that MinCut detects the weakened graph point associated with the agent. | `LIFEOS-003`; `POSTGRES-005` |
| `MINCUT-CLAIM-009` | `authority-claim` | The source assigns MinCut deterministic authority to sever an agent's connection. | `LIFEOS-003`; `POSTGRES-005`; `LPS-005`; `LPS-006` |
| `MINCUT-CLAIM-010` | `performance-claim` | The source claims millisecond-scale detection-to-connection-severing latency. | `LIFEOS-003`; `POSTGRES-005`; `POSTGRES-009` |
| `MINCUT-CLAIM-011` | `current-implementation-claim` | The source asserts that the workflow is rerouted after agent isolation. | `LIFEOS-003`; `POSTGRES-005`; `LPS-006` |
| `MINCUT-CLAIM-012` | `integrity-claim` | The source claims that isolation and rerouting prevent bad code from reaching the main codebase. | `LIFEOS-003`; `POSTGRES-005`; `LPS-005`; `LPS-006` |
| `MINCUT-CLAIM-013` | `architecture-proposal` | The source proposes moving next to Phase 4 materialization and portable release. | `POSTGRES-008`; `POSTGRES-009`; `LIFEOS-011`; `RELEASE-002` |
| `MINCUT-CLAIM-014` | `question-claim` | The source asks whether its explanation clarifies swarm protection; it does not establish that protection exists. | `LIFEOS-003`; `POSTGRES-005` |
| `MINCUT-CLAIM-015` | `question-claim` | The source asks whether the reader is ready to proceed; it does not record an owner decision or phase gate. | `POSTGRES-008`; `POSTGRES-009`; `LIFEOS-011`; `RELEASE-002` |
| `MINCUT-CLAIM-016` | `source-provenance-claim` | The retrieved source repeatedly uses citation marker [1] without recoverable citation provenance in the fulltext. | `NBVERIFY-000`; `POSTGRES-005` |

## Classification counts

- `application-claim`: 1
- `architecture-proposal`: 1
- `authority-claim`: 1
- `current-implementation-claim`: 5
- `engine-claim`: 1
- `integrity-claim`: 1
- `performance-claim`: 3
- `question-claim`: 2
- `source-provenance-claim`: 1

## Resolution boundary

- All 16 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Questions remain questions and grant no build, deployment, phase, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
