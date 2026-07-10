# NBSOURCE-017: Portable Nix Bundles and Executable Closures

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `f3da72cf-4bbc-433e-aadc-4e7db0b6f1cb`
- Object type: `original-indexed-markdown-source`
- Source SHA-256: `8bafed802d2ad7c633d356ee083589bfde7cbed22cc3030b7ff39f1db120149e`
- Source bytes / logical lines: `465` / `11`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `NIXBUNDLE-CLAIM-001` | `architecture-proposal` | The source proposes using nix bundle to pack a Nix closure into a single standalone executable folder. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `NIXBUNDLE-CLAIM-002` | `architecture-proposal` | The source proposes wrapping nix bundle in an AppImage as one route to a standalone executable folder. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `NIXBUNDLE-CLAIM-003` | `architecture-proposal` | The source proposes combining nix-user-chroot with pkgs.buildEnv as an alternative route for packing an environment into a standalone executable folder. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `NIXBUNDLE-CLAIM-004` | `architecture-proposal` | The source characterizes the proposed bundle as an install-in-place release that can run on any machine without /nix/store. | `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `NIXBUNDLE-QUESTION-001` | `question-claim` | The source asks whether to review how swarm agents spin up in the background after the executable folder is launched. | `LIFEOS-003`; `LIFEOS-005`; `POSTGRES-006`; `POSTGRES-009` |
| `NIXBUNDLE-PROVENANCE-001` | `source-provenance-claim` | The source uses citation markers [1] and [2], but the retrieved indexed fulltext provides no reference targets or exact cited passages. | `NBVERIFY-000`; `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009` |

## Classification counts

- `architecture-proposal`: 4
- `question-claim`: 1
- `source-provenance-claim`: 1

## Resolution boundary

- All 6 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Closing prompts remain questions and grant no build, deployment, initialization, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
