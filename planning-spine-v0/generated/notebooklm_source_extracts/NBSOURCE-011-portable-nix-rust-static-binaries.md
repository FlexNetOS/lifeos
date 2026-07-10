# NBSOURCE-011: Engineering Fully Portable Nix and Rust Static Binaries

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `689fb0da-a5f4-4658-8795-71092671bef8`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `efd5b58c7d9ec0b0a7903cfc83787b46031710240a62b5a23f98e40022ffd3df`
- Source bytes / logical lines: `955` / `16`
- Packet validation: `pass` (`/home/flexnetos/meta/var/tmp/notebooklm-parallel/NBSOURCE-011/validation.json`)
- Evidence boundary: the indexed source proves only that these statements or questions were present; it does not prove implementation, performance, authority, or readiness.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `NIXSTATIC-CLAIM-001` | `engine-fact` | The source prescribes compiling the Rust release against x86_64-unknown-linux-musl instead of the default glibc target. | `FOUNDATION-001`; `FOUNDATION-002`; `POSTGRES-009` |
| `NIXSTATIC-CLAIM-002` | `engine-fact` | The source asserts that the selected target bundles all required dependencies directly into the binary. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009` |
| `NIXSTATIC-CLAIM-003` | `engine-fact` | The source asserts that the selected target eliminates hardcoded dynamic-library paths that tie the executable to /nix/store. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009` |
| `NIXSTATIC-CLAIM-004` | `architecture-proposal` | The source proposes nix bundle wrapped in an AppImage as a more-contained packaging route. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `NIXSTATIC-CLAIM-005` | `architecture-proposal` | The source proposes nix-user-chroot as a route for packing an environment into a standalone executable folder. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `NIXSTATIC-CLAIM-006` | `architecture-proposal` | The source characterizes the proposed output as a portable install-in-place release. | `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `NIXSTATIC-CLAIM-007` | `source-provenance-claim` | The source uses citation markers [1], [2], and [3], but the indexed fulltext provides neither their source documents nor exact passages. | `NBVERIFY-000`; `FOUNDATION-003`; `POSTGRES-009` |
| `NIXSTATIC-QUESTION-001` | `question-claim` | The source asks how Yazelix and Nushell initialize after a proposed portable folder is launched. | `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `NIXSTATIC-QUESTION-002` | `question-claim` | The source asks how agents use native Nushell plugins to stream data. | `ADOPT-001`; `POSTGRES-004`; `POSTGRES-006`; `NBVERIFY-000` |

## Classification counts

- `architecture-proposal`: 3
- `engine-fact`: 3
- `question-claim`: 2
- `source-provenance-claim`: 1

## Resolution boundary

- All 9 atoms remain unresolved and are queued for their recorded primary-evidence, benchmark, or owner-decision method.
- Questions remain questions and grant no execution, deployment, initialization, phase-transition, or architecture authority.
- Repetition and relation to earlier NotebookLM claims are evidence of relationship only, never verification.
- No raw external fulltext is duplicated here merely for provenance; packet identity and the exact source checksum preserve the source boundary.
