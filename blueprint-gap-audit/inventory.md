# Blueprint gap inventory — 2026-07-23

Target: `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`
(6,340 lines / 974,321 B). Method: structural integrity scan + repository reconciliation
against current workspace HEADs. The blueprint is a **normative TARGET** doc with release
gates; its Review ledger explicitly "does not claim the inspected checkout already implements
the item." Therefore gaps here are **reconciliation drift** (ledger dated 2026-07-19 vs repo
state now) and **terminology clarity**, not stub text.

## Structural integrity — PASS (regression baseline, no gap)

| Check | Expected | Found | Status |
|---|---|---|---|
| HARD EXECUTION RULES | 21 | 21 (L11–31) | ✓ |
| Operational invariants (acceptance) | 19 | 19 (L6322–6340) | ✓ |
| Anchor conformance ledger rows | A01–A15 | 15 (L6270–6284) | ✓ |
| Review ledger rows | R01–R16 | 16 (L6292–6307) | ✓ |
| Component-arch subsections | §§1–20 | 20, contiguous (L658–5676) | ✓ |
| Anchor topology SHA | `abd36f1c…` present | 1 (L?) | ✓ |
| Placeholder/stub markers | 0 | 0 | ✓ |

These become the `verify.mjs structure` regression gate: additive edits must not disturb them.

## Findings

### RECON-01 — Review ledger R09/R14 are stale: `codedb ingest-envelope` is now implemented
- **Category:** reconciliation drift · **Severity:** high
- **Blueprint locus:** R09 (L6300), R14 (L6305), invariant 16 (L6337); §§3.4, 4.5, 14.
- **2026-07-19 claim:** "registered commands are scan/capture/materialize/import/query oriented …
  no ingest-envelope command"; classified as a required, activation-blocked release blocker.
- **Evidence (repo now, nu_plugin `@931d48f`):**
  - `crates/codedb/src/ingest.rs:1` — "Typed `codedb ingest-envelope` ingestion (ARCHBP-001)."
  - `crates/codedb/src/ingest.rs:14` — `ENVELOPE_SCHEMA_VERSION = "codedb.ingest-envelope.v0"`.
  - `crates/nu_plugin_codedb/src/main.rs:3253,3308` — registers the `codedb ingest-envelope` command.
  - `crates/codedb/src/main.rs:170` — CLI handler emits a typed receipt (`--format json`).
  - `crates/codedb_store_redb/src/lib.rs:46,383,447` — persists ingest-envelope files, content-addressed.
- **Closure:** append dated review-ledger row **R17** recording the implementation + revision;
  remaining gate stays exact-pin + witness + release-gate (invariant 16 unchanged). Do NOT rewrite
  R09/R14 (append-only audit log).

### RECON-02 — Review ledger R06/R07 are stale: `rtk_nu` adapter is now implemented
- **Category:** reconciliation drift · **Severity:** high
- **Blueprint locus:** R06 (L6297), R07 (L6298), R14 (L6305), invariant 16 (L6337); §§3.4, 4.4.
- **2026-07-19 claim:** "Exact-tree/symbol search: neither implementation exists"; `rtk_nu`
  reclassified as a new required adapter, "activation blocked until exact pin/witness."
- **Evidence (repo now, rtk-tokenkill):**
  - `src/rtk_nu_main.rs:3` — "`rtk_nu` … captures process bytes before any [transform]."
  - `src/rtk_nu_main.rs:23` — `SCHEMA_VERSION = "flexnetos.rtk_nu.envelope.v1"`.
  - `src/rtk_nu_main.rs:36` — clap `name = "rtk_nu"`.
  - Cargo crates present: `rtk`, `rtk_nu`, `rtk_nu_test_fixture`.
- **Closure:** append dated review-ledger row **R18**; remaining gate stays pin + schema-closure +
  witness (invariant 16 unchanged). Do NOT rewrite R06/R07.

### RECON-03 — Review-ledger pins are 4 days stale; several rows need re-review
- **Category:** currency · **Severity:** medium
- **Blueprint locus:** Review ledger preamble (L6288); R01, R08, R11, R12, R14.
- **Evidence:** ledger dated **2026-07-19**; current HEADs differ — nu_plugin `63d68743→931d48f`,
  lifeos `3d741436→4707497`, envctl now on `codex/profile-xdg-owner`. R01 re-verified **STILL OPEN**
  (lifeos `package.json` = `"vue": "^3.5.34"`, no svelte). R08/R11/R12 (nu_plugin/envctl-pinned)
  are unverified against current revisions.
- **Closure:** append dated row **R19** recording the currency delta, re-affirming R01 as OPEN, and
  scheduling R08/R11/R12 re-review as required work. No gate changed.

### CONSIST-01 — "ten operational invariants" vs this document's 19 acceptance invariants
- **Category:** terminology clarity · **Severity:** low
- **Blueprint locus:** A-ledger preamble (L6266), A15 (L6284), invariant 19 (L6339–6340) all say
  "ten operational invariants"; the "Operational invariants and acceptance" section lists **19**.
- **Evidence:** blueprint L6266 / L6284 / L6339–6340 ("ten operational invariants") vs the 19
  numbered items at L6322–6340 — same file, self-contradictory counts on first read.
- **Reading:** "ten operational invariants" denotes the **anchor's** invariant set (the ten mapped by
  A15/rendered across D01–D24), which is distinct from this document's 19-item acceptance list.
  A first-time reader can mistake the two counts for a contradiction.
- **Closure:** add a single **clarifying footnote** at the head of the acceptance section
  distinguishing the anchor's ten invariants from this document's nineteen. Non-normative, additive.

## Out of scope this run (tracked, not built)
- R01 Vue→Svelte migration remains a genuine open release blocker (code change, not a doc edit).
- Deep re-review of R08/R11/R12 against current revisions (scheduled by R19).
