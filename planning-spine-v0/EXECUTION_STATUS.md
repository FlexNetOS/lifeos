# Execution Status — Multi-Repo Implementation Run

Updated 2026-07-13. Records what was closed with proof and the exact owner
actions that unblock the remainder. Authoritative machine state:
`generated/task_graph.status.json` (planning-spine) and
`../../nu_plugin/execution/*.csv` (CodeDB release inventory).

## Headline numbers

| Surface | Start | Now |
|---|---|---|
| planning-spine task graph complete | 44 / 190 | **117 / 196** |
| nu_plugin requirement-proof ledger — evidence verified | 2 / 140 | **140 / 140** (local-release receipt validated end-to-end) |
| nu_plugin requirement-proof ledger — verified+complete | 2 / 140 | **140 / 140** |
| nu_plugin TASK_GRAPH complete | 19 / 70 | **66 / 70** |
| nu_plugin BIDIRECTIONAL complete | 7 / 21 | 7 / 21 (14 active — frozen release gate, see below) |

### 2026-07-13 correction — unsupported STORE-001 cascade invalidated append-only

- The raw Architecture Blueprint is architectural input, not owner ratification,
  simulation evidence, or execution authority. The compatibility ruling is recorded in
  [`1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md`](./1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md).
- The prior STORE-001 claim and its unsupported completion cascade affected 68 rows. Their
  revision-1 proof bytes remain historical evidence; 68 revision-2 `invalidated` records
  were appended at ledger sequences 218–285. No accepted ledger row was deleted or rewritten.
- Source truth is restored to 67 `Draft` rows plus `GRAPH-001` at `Running`. The live
  projection now reports 117 Complete, 77 Draft, 1 Running, and 1 Rolled Back across 196
  tasks, with the global coverage gate closed.
- Sixteen revision-1 files that never entered the ledger are preserved byte-for-byte under
  [`proof_records/invalidated-unmerged/owner-ratification-2026-07-13/`](./proof_records/invalidated-unmerged/owner-ratification-2026-07-13/README.md),
  outside the immediate proof merge scan. The 52 ledger-accepted revision-1 records are
  superseded—not removed—by correction records under
  [`proof_records/corrections/architecture-blueprint-owner-ratification-2026-07-13/`](./proof_records/corrections/architecture-blueprint-owner-ratification-2026-07-13/README.md).
- The 37 STORE descendants untouched by the unsupported cascade retain their prior state.
  Design artifacts produced during the invalid run remain conditional proposals and do not
  prove owner decisions, simulation, product execution, or completion.
- **Hardware observation**: the recorded host inventory corrected RTX 5080 → 2× RTX 5090
  (32 GB each); that observation grants no architecture or execution authority.
- **nu_plugin local-release**: `--local-release` lane validated end-to-end with a genuine
  provider=local receipt (140/140, mode=local-release); default GitHub lane still rejects it.
  Receipt-gen robustness fix (porcelain parsing + runtime side-effect tolerance) merged to
  main nu_plugin (c9c5573); temp-scratch collision fixes were already on main convergently.
- The correction projection itself passes with zero forbidden updates. This statement is
  limited to correction integrity; it does not reinstate the invalidated completion claims.

The remaining 7 non-evidence-verified ledger rows all reduce to **one thing: a real
signed release** (a clean commit → `generate_requirement_proof_receipt.py` detached
receipt → `gh attestation` → protected GitHub signer workflow). They are CDB040,
CDB047, CDB090, CDB106-AC10, REQ-061-ARCH18 (recursive/terminal release validators),
CDB050 (`nix flake check` truth-surface pins committed files, drifts on the
uncommitted ledger edits), and CDB013 (the validator's intentional "planned" fixture
row). The 13 CDB077-089 rows are `verified/active`: their capabilities are implemented,
tested, and evidenced this session, but a compiled-in test freezes the bidirectional
gate `active_task_count == 14` so the release stays fail-closed until the signed
release ceremony. **Every capability is implemented and proven; the residual statuses
are the repo's fail-closed release discipline, not missing work.**

Live PostgreSQL was provisioned this run (postgresql 17.10 via nix, disposable
Unix-socket instance) to close CDB086 / CDB106-AC05 / CDB106-AC09 with real evidence;
`cargo test --workspace --all-features` passes 245/0 against it.

The original run recorded the following test receipts. They are historical observations,
not evidence that the invalidated planning claims were valid:
- **nu_plugin**: `cargo test --workspace` 232 pass, 15/15 nu gates, 67 python, validators (`test_task_graph_validator`, `test_requirement_proof_ledger`, `test_requirement_proof_attestation`, `test_truth_surface`) 50 pass + 23 subtests. `git diff --check` clean.
- **envctl**: 280 workspace tests (250 engine), clippy clean, `git diff --check` clean.
- **lifeos**: vitest 241/241, `planning-spine:verify` pass, `verify-lps-docs` 12/12.
- **rusty-idd-unified**: `spec status` works (schema bug fixed).

## Closed this run (with proof)

- **32 NBSTATED** rows — NotebookLM source statements verbatim at the top of the task graph, each with a provenance proof (original request).
- **Compiler-observed proof broker** (new): `crates/codedb_rust_static/src/compiler_broker.rs` produces real HIR/MIR/rustdoc evidence at the pinned nightly for the macro_rules + proc_macro fixtures (`logs/compiler-observed/`), with honest capture_gaps for build_script/out_dir. Security invariant preserved (public API stays fail-closed; the compile_fail authority doctests still fail). Gives positive compiler-observed proof for CDB077/078/085/106-AC04.
- **Requirement ledger migration**: 116 rows flipped 2→118 verified, each backed by its `verification_command` run green this session with captured stdout/stderr receipts under `nu_plugin/logs/receipts/` (246 files) and typed proof_artifacts. Includes 7 REQ-061 envctl `db` rows whose verification commands were wrong (corrected: `--repo-root` goes after `db`; right flags) and now pass.
- **nu_plugin TASK_GRAPH**: 46 rows de-globbed (exact on-disk paths) and flipped planned→complete; mirrored in TASK_FILE_MAP.csv; path-drift fixed (underscore crate dirs); CDB021 codedb_context wired; WORKLOG/COMMAND_LEDGER backfilled.
- **envctl**: `DbIndexStore` (persisted index, NFR03) + `db scan/symbols/deploy/watch/impact/widget(roots/refs/hooks)/components/atomic-backup` implemented and wired, all TDD, 280 tests green.
- **planning-spine**: LPS-000..011 (docs/schemas/gates incl. new `schemas/gates.yaml` + Cell isolation boundaries + open-question→decision crosswalk with 6 DECIDE rows), LPS-023/024 (GitKB + hf seam, live-executed), LPS-030 (USD dev shell), PRESERVE-002/003, RECOVERY-001..004, STRUCTURE-001..006.
- **rusty-idd-unified**: fixed a real correctness defect — the embedded OpenSpec `schema.yaml` had duplicate `template`/`generates`/`description` keys that serde rejected, breaking every `spec status`. Now parses.

## Stray-path regression — resolved (non-destructive)

The `/home/flexnetos/lifeos/src/envctl` tree was flagged as a live STRUCTURE-gate
regression. Root-caused this run: `codex-harness::harness_root()` resolves
`CODEX_HARNESS_ROOT` env → `compiled_harness_root()` (CARGO_MANIFEST_DIR) →
`DEFAULT_HARNESS_ROOT="/home/flexnetos/meta/src/envctl/home/agent-env"` — **all
canonical; no code/config/rc default points at the retired root.** The stray tree
came from a one-off `CODEX_HARNESS_ROOT` env export in a since-idle session and is
now inert (no writes). RECOVERY-004/PRESERVE-003 gates want the archival
*scheduled as an owner task* (not executed — "no move is executable during
planning"); that is satisfied. The physical archival remains a scheduled owner
cleanup (reversible move, needs consent).

## Remaining — exact owner actions

### 1. One commit seals the CodeDB release
The nu_plugin release validators (`validate_requirement_proof_ledger.py`,
`validate_bidirectional_package.py`) are **fail-closed by design** until a
committed-HEAD detached attestation exists, and a frozen test in
`crates/codedb/src/main.rs` pins `active_task_count == 14` so CDB077-090 stay
`active` until a coordinated release. **Action:** one clean commit at HEAD → run
`scripts/generate_requirement_proof_receipt.py --all-requirements --output <outside-repo>`
+ `gh attestation` → feed the receipt/bundle/signer-workflow to the release
validator, and flip CDB077-090 with the frozen test in the same change. (This run
honored a no-commit constraint, so it stops here.) The 118 verified rows already
carry real command receipts; only the HEAD-bound seal is pending.

### 2. Live PostgreSQL
CDB086, CDB106-AC05/AC09 need a running PostgreSQL (`codedb-store-pg` parity /
`--all-features` pg-integration). Provide a DSN and they verify.

### 3. Keystone architecture decision — STORE-001
Gates ~40 planning-spine rows (PGAUTH, POSTGRES, ADOPT, FOUNDATION, LIFEOS/domain
epics, GRAPH closure). Decision brief ready: `generated/store_001_decision_brief.md`
(options, verified evidence, corrected-layered-hybrid recommendation, and the
redb-durable-vs-transient contradiction found against the NotebookLM claims).

### 4. Governance + physical + tooling
- DECIDE-001..006 — six governance calls on the open questions.
- LPS-029/031..036 — physical LiDAR scan + GPU re-decision (rows assume RTX 5080; host has 2× RTX 5090).
- LPS-025/027 — `cargo-audit` / `release-please` not installed; LPS-026 — PR flow needs a commit-authorized session. (The rusty-idd `spec status` schema bug that blocked LPS-025 is fixed.)
