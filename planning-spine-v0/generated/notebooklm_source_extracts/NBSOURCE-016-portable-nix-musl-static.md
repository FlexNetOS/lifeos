# NBSOURCE-016: Portable Nix Builds via Musl Static Compilation

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `bb86c631-1ca3-4e21-8da6-adc8edd37f1b`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `7bca82f9c9bb523cd31daf85c83961c3b4526ac7df5d895cb3768c7962be879b`
- Source bytes / logical lines: `844` / `16`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `NIXMUSL-CLAIM-001` | `engine-fact` | The source asserts that standard glibc-based Nix builds put absolute /nix/store dynamic-library paths in executable RPATH metadata. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009` |
| `NIXMUSL-CLAIM-002` | `current-implementation-claim` | The source asserts that an executable with those runtime dependencies immediately fails on a machine without the Nix daemon. | `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `NIXMUSL-CLAIM-003` | `architecture-proposal` | The source proposes compiling the Rust stack for a musl target such as x86_64-unknown-linux-musl as a strict-static release route. | `FOUNDATION-001`; `FOUNDATION-002`; `FOUNDATION-003`; `POSTGRES-009` |
| `NIXMUSL-CLAIM-004` | `architecture-proposal` | The source claims that the musl route bundles all required dependencies into the binary, removes hardcoded /nix/store paths, and yields a standalone portable release. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `NIXMUSL-CLAIM-005` | `performance-claim` | The source presents standalone true portability as the release outcome of the proposed musl compilation route. | `POSTGRES-009`; `RELEASE-002`; `FOUNDATION-003` |
| `NIXMUSL-CLAIM-006` | `question-claim` | The source asks whether to explore gitkb/meta Rust/JavaScript build isolation or the LifeOS UI communication layer next; it does not itself assert either implementation. | `FOUNDATION-002`; `POSTGRES-009` |
| `NIXMUSL-CLAIM-007` | `source-provenance-claim` | The retrieved source contains citation markers [1] and [2] without recoverable reference documents or exact cited passages. | `NBVERIFY-000`; `FOUNDATION-003`; `POSTGRES-009` |

## Classification counts

- `architecture-proposal`: 2
- `current-implementation-claim`: 1
- `engine-fact`: 1
- `performance-claim`: 1
- `question-claim`: 1
- `source-provenance-claim`: 1

## Resolution boundary

- All 7 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Closing prompts remain questions and grant no build, deployment, initialization, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
