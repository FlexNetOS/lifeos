# Closure plan — 2026-07-23

Every edit is **additive** (append rows / add a footnote). No existing rule, invariant, ledger
row, or the anchor SHA is modified or removed. This satisfies hard rule 21 (implementation
progress never narrows the anchor) and the "upgrades, never downgrades" law.

## RECON-01 — status: closing
- **Closure:** Append review-ledger row **R17** immediately after R16 (blueprint L6307),
  reconciling R09/R14. Records that `codedb ingest-envelope` is implemented at nu_plugin
  `@931d48f` (`codedb/src/ingest.rs`, `nu_plugin_codedb/src/main.rs:3308`, schema
  `codedb.ingest-envelope.v0`, ARCHBP-001). Remaining gate unchanged: exact pin + witness +
  release-gate execution per invariant 16.
- **Verifier:** `verify.mjs refine` asserts `^| R17 |` present and cites `ingest-envelope`.

## RECON-02 — status: closing
- **Closure:** Append review-ledger row **R18** after R17, reconciling R06/R07. Records that the
  `rtk_nu` adapter is implemented in rtk-tokenkill (`src/rtk_nu_main.rs`, crates `rtk_nu` +
  `rtk_nu_test_fixture`, envelope `flexnetos.rtk_nu.envelope.v1`). Remaining gate unchanged: pin +
  schema-closure + witness per invariant 16.
- **Verifier:** `verify.mjs refine` asserts `^| R18 |` present and cites `rtk_nu`.

## RECON-03 — status: tracked
- **Closure:** Append review-ledger row **R19** after R18. Records the 2026-07-19→2026-07-23
  currency delta (nu_plugin `63d68743→931d48f`, lifeos `3d741436→4707497`, envctl on
  `codex/profile-xdg-owner`), re-affirms **R01 Vue→Svelte as OPEN** (verified), and schedules
  R08/R11/R12 re-review as required work. No gate changed.
- **Verifier:** `verify.mjs refine` (R17/R18 present implies the appended block landed); R19 row
  carries the currency note. Manual: R01 remains in the ledger unaltered.

## CONSIST-01 — status: closing
- **Closure:** Insert one **clarifying footnote** directly under the
  `## Operational invariants and acceptance` heading (blueprint L6320), before item 1:
  a non-normative note that "ten operational invariants" throughout the anchor ledger denotes the
  **anchor's** invariant set (mapped by A15 / rendered across D01–D24), distinct from this
  document's **nineteen** acceptance invariants below. No numbered item is touched.
- **Verifier:** manual read; `verify.mjs structure` still asserts acceptance invariants == 19
  (the footnote must not perturb the count).

## Post-edit gates
- `verify.mjs structure` — counts/anchor/placeholder baseline still green (additive-only proof).
- `verify.mjs refine` — R17 + R18 rows present with evidence; invariant 16 text intact (no gate weakened).
- `verify.mjs complete` — every finding resolved to closing or tracked (none left unresolved).
- `verify.mjs all && bun run test` — overall.

## Completion — 2026-07-23

- **Gates:** `verify.mjs all` → **32/32 PASS**. structure 9/9, specify 6/6, plan 5/5, refine 5/5, complete 7/7.
- **Blueprint diff:** +7 insertions, 0 deletions (R17/R18/R19 rows, dated addendum line, counts footnote). Read back per hard rule 20; R16→R17→R18→R19 render as valid 8-column rows.
- **No-regress:** `bun run test` = 509/510 passed. The single failure (`tests/archbp-093-reattach-unit.spec.ts`, a systemd-unit reattach test) is pre-existing and orthogonal to this doc-only change; not introduced here, not fixed here (tracked as implementation-side work, cf. R19).
- **Phase grades:** S 98 · P 100 · A 100 · R 98 · C 98 (all ≥95, no regrade needed).
- **Findings resolved:** RECON-01 closing (R17), RECON-02 closing (R18), RECON-03 tracked (R19), CONSIST-01 closing (footnote). Zero left open.
