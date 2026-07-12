# PRESERVE-003 — Canonical Topology Transition Reconciliation

Task: `PRESERVE-003` (parent `RECOVERY-004`, phase `1-preservation`, cell `policy-cell`, `simulation_required=FALSE`).
Gate: *Every future move has exact source and target, pre/post checksums, Git ref equivalence, worktree repair, consumer update, rollback, and proof tasks; no move is executable during planning.*

This is a **definition/reconciliation** artifact. Per its `blocked_paths` (`filesystem move; worktree repair; repo mutation; deletion; secrets/**`) **nothing here is executed** — moves that are already done are reconciled against their receipts; moves that remain are fully specified but left un-executable until an explicit later owner gate.

Status of this artifact: **PARTIAL** — the topology map is complete for every move discoverable today, but the `RECOVERY-004` precondition in this task's own `inputs` ("valid capabilities and stray state reconciled") is **not yet closed** (no `RECOVERY-001..004` proofs exist), so the "every future move is enumerated" clause cannot be asserted exhaustively. See "Blocking precondition" below.

---

## 1. Moves already executed (reconciled against STRUCTURE receipts)

The canonical meta-root topology transition was executed and proven under the `STRUCTURE-001..006` chain. Each row below pairs the move with its receipt and its passing proof record. All receipts live in `planning-spine-v0/generated/`; all proofs in `planning-spine-v0/proof_records/`.

| Move | Source → Target | Receipt | Proof | Gate element coverage |
|------|-----------------|---------|-------|-----------------------|
| Parent root rename | `/home/flexnetos/lifeos` → `/home/flexnetos/meta` (atomic, same device 66310, inode 14306801) | `structure_meta_root_rename_receipt.json` (`old_path_absent: true`) | `STRUCTURE-001.proof.json` (pass) | source+target ✓, device/inode identity ✓, archive rollback ✓ |
| LifeOS repo independence | LifeOS remained a synchronized independent repo through the rename | `structure_lifeos_relocation_receipt.json` (HEAD `177a27b53400…`, clean) | `STRUCTURE-002.proof.json` (pass) | git ref equivalence ✓ |
| Meta checkout promotion | `/home/flexnetos/meta/src/meta` → `/home/flexnetos/meta` (`source_absent: true`, gitkb verify ok) | `structure_meta_root_promotion_receipt.json` | `STRUCTURE-003.proof.json` (pass) | source+target ✓, identity+GitKB preserved ✓ |
| Root collision archive | 5 top-level collisions (`.claude`,`.git`,`.gitignore`,`.kb`,`AGENTS.md`) displaced+archived before authority replace | `structure_meta_collision_diff.json` | `STRUCTURE-004.proof.json` (pass) | archive-first rollback ✓ |
| Fleet ownership | one `.meta.yaml` owns LifeOS + peer fleet; declared_projects=40, missing=0, origin_mismatches=0 (at receipt time) | `structure_meta_fleet_ownership.json` | `STRUCTURE-005.proof.json` (pass) | consumer/manifest update ✓ |
| Control-plane acceptance | Meta sole clean control plane; LifeOS registered child; consumers use canonical names | `structure_acceptance_report.json` (result pass) | `STRUCTURE-006.proof.json` (pass) | full acceptance ✓ |
| Worktree metadata repair | 3 named worktrees repaired; `active_git_files_with_retired_root: 0` | `structure_worktree_repair_receipt.json` (result pass) | `STRUCTURE-006-v2.proof.json` (pass) | worktree repair ✓ |

**Reconciliation verdict for §1:** every move in the canonical transition is DONE and carries source, target, ref equivalence, worktree repair, consumer update, archive rollback, and a passing proof. No re-execution required.

---

## 2. Post-receipt move: LifeOS into the Meta peer namespace (PR #101)

The `STRUCTURE-006` acceptance report recorded LifeOS at `root: /home/flexnetos/meta/lifeos` (a top-level child). **After** the receipts were written, LifeOS was moved into the canonical peer namespace:

- **Move:** `/home/flexnetos/meta/lifeos` → `/home/flexnetos/meta/src/lifeos`
- **Executed by:** meta commit `a79802f` — *"fix: place LifeOS in the Meta peer namespace (#101)"* (PR #101, author drdave, 2026-07-10).
- **Consumer update:** `.meta.yaml` now declares `lifeos: { repo: git@github.com:FlexNetOS/lifeos.git, path: src/lifeos }`; manifest project count is now **41** (was 40 at `structure_meta_fleet_ownership.json` receipt time — the +1 is LifeOS promoted from special child to declared peer).
- **Ref equivalence:** LifeOS origin unchanged (`git@github.com:FlexNetOS/lifeos.git`); repository identity preserved across the move.
- **Reconciliation verdict:** DONE and consistent. The STRUCTURE receipts are *historically correct* at their observation time; PR #101 is the authoritative superseding location. Any doc still citing `/home/flexnetos/meta/lifeos` as the live path is stale — canonical is `src/lifeos`.

---

## 3. Open regression — retired root resurrected (`/home/flexnetos/lifeos/src/envctl`)

**Regression against `STRUCTURE-001`/`STRUCTURE-006`.** The `structure_meta_root_rename_receipt.json` asserts `old_path_absent: true` for `/home/flexnetos/lifeos`. That clause **no longer holds on disk**: on 2026-07-11 the retired root was partially resurrected.

Observed tree (read-only; nothing mutated by this task):

```
/home/flexnetos/lifeos/src/envctl/home/agent-env/codex-harness/
  ledger/{counters,harness,model_router,decisions}.jsonl
  state/model-router/last-route.json
```

**Root cause (evidence, not symptom):** the ledger records carry `"cwd":"/home/flexnetos/meta/src/envctl"` (the *canonical* envctl) yet the ledger **files** are written to the *retired* `/home/flexnetos/lifeos/...` path — and the newest entry is `ts_utc: 2026-07-12T04:34:54Z`, i.e. **the write is live and ongoing**. A running codex-harness / agent-env instance has its ledger output directory (an `AGENT_ENV_HOME`-style absolute path) still pinned to `/home/flexnetos/lifeos/src/envctl/home/agent-env`, not to the promoted `/home/flexnetos/meta` root. This is stray runtime state from a mis-pathed harness, **not** a git repo (no `.git` under the resurrected tree).

**Defined disposition task (archive-first, reversible — NOT executed here):**

- `topology-move-envctl-stray-state`
  - **exact source:** `/home/flexnetos/lifeos/src/envctl/` (entire resurrected subtree)
  - **exact target:** `/home/flexnetos/.local/state/meta/archives/<UTC>-lifeos-retired-root-envctl-stray/`
  - **pre-checksum:** `find /home/flexnetos/lifeos -type f -print0 | sort -z | xargs -0 sha256sum > pre.manifest`
  - **post-checksum:** re-hash inside the archive; byte-for-byte manifest equality
  - **Git ref equivalence:** N/A (not a repo) — record "no git ref; runtime-state archive only"
  - **worktree repair:** N/A
  - **consumer update — the actual fix:** locate the harness process/config writing this path and repoint its ledger home to a `/home/flexnetos/meta`-anchored directory, so the retired root is not re-created after archival; without this, archival alone will be re-resurrected on the next harness tick.
  - **rollback:** restore the archived subtree to `/home/flexnetos/lifeos/src/envctl/` from the manifest
  - **proof task:** `PRESERVE-003 → RECOVERY-004` follow-up proof asserting `old_path_absent` restored AND the harness config repointed (so `STRUCTURE-001`'s absence clause holds again and stays holding)
  - **owner gate:** blocked by this task's `blocked_paths` (`filesystem move; deletion`) — execution requires an explicit later owner gate and RECOVERY-003 (envctl) disposition.

Until this executes, `STRUCTURE-001`/`STRUCTURE-006` are in **regression** on the absence clause. Recorded here; not silently ignored.

---

## 4. Future move class — transient worktrees

`preserve_provenance_baselines.csv` inventories **9 transient git worktrees** (`git_kind=worktree`, `adoption_status=worktree-transient`) that must be reconciled rather than adopted independently:

`flexnetos_runner-kache-shim-wt`, `flexnetos_runner-meta-prefix-wt`, `meta-ruvector-qat-wt`, `meta-ruvector-router-wt`, `mrv-95-sync`, `mrv-ci-fix`, `mrv-reconcile-wt`, `rusty-idd-reconcile-wt`, `weave-build-audit`.

**Defined reconciliation task per worktree** (archive-first, reversible — NOT executed here):
- **exact source:** the `-wt` / `mrv-*` directory under `/home/flexnetos/meta/src/`
- **exact target:** either (a) merged upstream into its parent repo's default branch, or (b) archived under `/home/flexnetos/.local/state/meta/archives/<UTC>-worktree-<name>/`
- **pre/post checksum:** hash the worktree branch tip + working tree before/after; parent-repo `git worktree list` before/after
- **Git ref equivalence:** the worktree branch ref must be preserved (pushed or archived) — no branch tip lost
- **worktree repair:** `git worktree prune` on the parent after removal; verify `git worktree list` no longer references the removed path
- **consumer update:** none declared in `.meta.yaml` (worktrees are not declared projects); confirm no tooling references the path
- **rollback:** `git worktree add` re-materializes the branch at the original path
- **proof task:** per-worktree proof recording branch tip SHA preserved + parent `git worktree list` clean
- **owner gate:** all clean (`worktree_state=clean`) today — but the branch work must be reconciled through `RECOVERY-002/004` before removal so no in-flight capability is dropped (upgrade-only).

---

## 5. Current canonical topology (post-reconciliation snapshot)

- **Meta control plane:** `/home/flexnetos/meta` (origin `git@github.com:FlexNetOS/meta.git`).
- **LifeOS product child:** `/home/flexnetos/meta/src/lifeos` (origin `git@github.com:FlexNetOS/lifeos.git`) — per PR #101.
- **Peer fleet:** 41 declared projects in `.meta.yaml`; `preserve_provenance_baselines.csv` inventories 41 live `.git` peers under `/home/flexnetos/meta/src/` (11 accepted-core, plus candidates, infra-support, and 9 transient worktrees).
- **Retired root:** `/home/flexnetos/lifeos` — **should be absent** per `STRUCTURE-001`; currently resurrected by the §3 stray envctl harness state (open regression).
- **Generated evidence tree:** `planning-spine-v0/generated/` (this file + `preserve_provenance_baselines.csv` + `structure_*` receipts) — kept separate from product source, per the task goal's "separating temporary worktrees and generated evidence."

---

## 6. Blocking precondition

`PRESERVE-003.inputs` requires `RECOVERY-004` ("valid capabilities and stray state reconciled"), and `next_action` says *"Decompose topology only after prior task truth, valid capabilities, and stray state are reconciled."* No `RECOVERY-001..004` proof records exist yet. Therefore:

- Every move **discoverable today** (§1 done, §2 done, §3 defined, §4 defined) is fully specified with source/target, checksum plan, ref equivalence, worktree repair, consumer update, rollback, and proof task.
- But the exhaustive "every future move" guarantee is **contingent on RECOVERY-004** surfacing any additional stray state. Until RECOVERY-004 closes, this reconciliation is **PARTIAL by design**, not by omission.

**Recommended closure order:** RECOVERY-001..004 → execute §3 envctl stray-state archive + harness repoint under owner gate → execute §4 worktree reconciliation → re-run `STRUCTURE-001` absence check → flip `PRESERVE-003` to pass.
