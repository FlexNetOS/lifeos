# Planning Spine consolidation authority

This directory records the 2026-07-20 consolidation of the retired LifeOS
handoff material and the pre-reset proof shadow into the repository-native
Planning Spine. It is maintained provenance, not a second planning system.

## Controlling authority order

1. Current owner instructions plus applicable `AGENTS.md` and durable operating
   contracts.
2. The exact-byte architecture anchors in
   `../1.0_VISION/Architecture_Anchors/`, with their hashes and full line
   coverage fixed by `receipts.json` and `section_inventory.json`.
3. Canonical maintained Planning Spine inputs, task records, authority
   contracts, and accepted proof history.
4. Legacy `.handoff` and pre-reset material as migration or historical
   evidence only.
5. Generated navigation and task projections, which never create authority.

Checked implementation and accepted proof determine current state. The anchors
determine the required target topology, subject to higher owner/contracts
authority. A target claim is not implementation proof.

## Consolidated surfaces

- `legacy_handoff_manifest.json` inventories all 8 files and all 12
  substantive items from the tracked legacy `.handoff` payload. The originally
  requested retired path `/home/flexnetos/lifeos/.handoff` was absent and was
  not recreated.
- `legacy_handoff_crosswalk.csv` gives every substantive handoff claim an
  explicit canonical destination and disposition.
- `retired_shadow_manifest.json` inventories all 442 files from the untracked
  `proof-ledger-pre-reset-20260713T171233Z` shadow, including 407 byte-identical
  copies, 26 historical variants, and 9 unique historical-only files. All
  historical bytes remain recoverable, but none is active authority.
- `planning_spine_inventory.json` is the deterministic complete-file inventory
  of the active Planning Spine. It excludes only itself to avoid a recursive
  digest.
- `archive_receipt.json` fixes the archive location, file counts, manifest
  digests, verification result, and recovery procedure.

The active repository no longer contains `.handoff` or a pre-reset proof tree.
Continuity uses repository source, the accepted proof ledger, generated
navigation, GitKB task context where available, and mandatory ICM recall/store.

## Conflict handling

`../1.0_VISION/Architecture_Anchors/anchor_conflict_ledger.csv` cites both
sides, names the controlling authority, and records each resolution.
`anchor_claim_task_crosswalk.csv` connects target requirements to stable or new
task IDs, implementation areas, existing proof, missing proof, and final state.
Historical proof may contain earlier owner models; `STORE-001` revision 2 and
the conflict ledger supersede those statements without rewriting accepted
history.

## Regeneration and checks

Run from the LifeOS repository root:

```bash
bun planning-spine-v0/scripts/import-architecture-anchors.mjs --check
bun planning-spine-v0/scripts/build-consolidation-inventory.mjs --check
bun run planning-spine:navigation:generate
bun run planning-spine:navigation:check
bun run planning-spine:verify
```

Do not hand-edit the two anchor Markdown files, generated navigation files, or
append-only proof ledger. Update their owning inputs or merger/generator.
