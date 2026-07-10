# NBSOURCE-014: Orchestrating Rust and Node Separation with Gitkb Meta

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `62927ca6-f5bb-42a3-9440-9ff4a95c660f`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `4b82f691a752d0963d97469d43a34a2ae8b7da064a5c2a8e7e9a3a39f285b896`
- Source bytes / logical lines: `927` / `15`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `RNS-CLAIM-001` | `current-implementation-claim` | gitkb/meta acts as an orchestrator that isolates auto-generated Node bindings from clean Rust code. | `LPS-023`; `STRUCTURE-003`; `STRUCTURE-005`; `LIFEOS-003` |
| `RNS-CLAIM-002` | `architecture-proposal` | Defining clear boundaries in a .meta file lets Rust and generated Node-binding components be treated as parallel peers rather than a tangled monolith. | `STRUCTURE-005`; `STRUCTURE-006`; `LIFEOS-004` |
| `RNS-CLAIM-003` | `architecture-proposal` | meta exec can be configured to compile Rust only in pure directories such as ruvector-core and ruvllm. | `LPS-027`; `FOUNDATION-002`; `DEVELOP-001` |
| `RNS-CLAIM-004` | `architecture-proposal` | Restricting the Rust build to those pure directories bypasses JavaScript and WebAssembly output/exhaust folders. | `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `RNS-CLAIM-005` | `performance-claim` | The restricted build guarantees a final release artifact untainted by napi-rs boilerplate. | `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `RNS-QUESTION-001` | `question-claim` | The source asks whether a comprehensive system prompt should be provided to instruct agents to verify and build this exact environment. | `LPS-027`; `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |

## Classification counts

- `architecture-proposal`: 3
- `current-implementation-claim`: 1
- `performance-claim`: 1
- `question-claim`: 1

## Resolution boundary

- All 6 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Closing prompts remain questions and grant no build, deployment, initialization, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
