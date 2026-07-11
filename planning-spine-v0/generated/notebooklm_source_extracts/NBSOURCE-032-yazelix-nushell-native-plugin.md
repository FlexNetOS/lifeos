# NBSOURCE-032: Yazelix and Nushell Native Plugin Architecture

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `f2f20a8b-7235-4b88-94ef-8e8c01860aea`
- Object type: `original-markdown-source`
- Source SHA-256: `d0045cf515b2f422dbe04434d88dccb7108e670031c7b289beebff399bfe36a5`
- Source bytes / logical lines: `647` / `7`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `YNP-CLAIM-001` | `current-implementation-claim` | The source asserts that agents currently use native Nushell plugins. | `RECOVERY-002`; `ADOPT-001`; `FOUNDATION-001`; `POSTGRES-004` |
| `YNP-CLAIM-002` | `current-implementation-claim` | The source asserts that the referenced Nushell plugins are built as Rust-native binaries. | `FOUNDATION-001`; `RECOVERY-002`; `ADOPT-001` |
| `YNP-CLAIM-003` | `engine-fact` | The source asserts that the referenced Nushell plugins communicate with the shell using MessagePack. | `RECOVERY-002`; `ADOPT-001`; `POSTGRES-004` |
| `YNP-CLAIM-004` | `performance-claim` | The source characterizes the MessagePack protocol path as highly optimized. | `ADOPT-001`; `POSTGRES-004`; `POSTGRES-009` |
| `YNP-CLAIM-005` | `current-implementation-claim` | The source asserts that agents stream structured data including Nushell tables through this architecture. | `RECOVERY-002`; `ADOPT-001`; `POSTGRES-004` |
| `YNP-CLAIM-006` | `current-implementation-claim` | The source asserts that the structured data is streamed directly into memory. | `RECOVERY-002`; `ADOPT-001`; `POSTGRES-004`; `POSTGRES-009` |
| `YNP-CLAIM-007` | `performance-claim` | The source claims that the in-memory data can be vectorized instantly. | `POSTGRES-005`; `POSTGRES-006`; `POSTGRES-009` |
| `YNP-CLAIM-008` | `current-implementation-claim` | The source asserts that vectorized data is written into .rvf files. | `PGAUTH-003`; `POSTGRES-005`; `POSTGRES-006`; `STORE-001` |
| `YNP-CLAIM-009` | `current-implementation-claim` | The source asserts that the vectorized data can be written into redb. | `PGAUTH-002`; `PGAUTH-006`; `ADOPT-001`; `STORE-001`; `POSTGRES-006` |
| `YNP-CLAIM-010` | `comparison-claim` | The source asserts that this path does not require serialization to JSON text. | `RECOVERY-002`; `ADOPT-001`; `POSTGRES-004`; `POSTGRES-009` |
| `YNP-CLAIM-011` | `question-claim` | The source asks whether to explore Yazelix and Nushell background initialization after launch of a portable release folder. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009`; `LIFEOS-011` |
| `YNP-CLAIM-012` | `question-claim` | The source asks the reader to select another workflow topic. | `NBVERIFY-000`; `POSTGRES-009` |
| `YNP-CLAIM-013` | `source-provenance-claim` | The retrieved fulltext contains citation markers [1, 2] but no bibliography, source identities, versions, or cited passages. | `NBVERIFY-000`; `RECOVERY-002`; `ADOPT-001` |

## Classification counts

- `comparison-claim`: 1
- `current-implementation-claim`: 6
- `engine-fact`: 1
- `performance-claim`: 2
- `question-claim`: 2
- `source-provenance-claim`: 1

## Resolution boundary

- All 13 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Questions remain questions and grant no build, deployment, phase, test, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
- Yazelix ownership remains split between editable input under `/home/flexnetos/.config/yazelix`, generated proof under `/home/flexnetos/.local/share/yazelix`, and the active `/home/flexnetos/.nix-profile/bin/yzx` frontdoor.
