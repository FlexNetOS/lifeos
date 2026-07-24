#!/usr/bin/env python3
"""Verify-pass KB upgrades:
U1 — move duplicated Vue→Svelte migration scope (T005, T056) from
     glass-engine-frontdoor into glass-svelte-migration (T165's home).
U2 — append pin-currency audit sections (observed 2026-07-23) to affected tasks.
U5 — epic: check staged acceptance criteria with evidence, add progress log,
     note the codex tag collision.
Also syncs the TSV component column for T005/T056.
"""
import csv, re
from pathlib import Path

WS = Path("/home/flexnetos/meta/.kb/workspaces/main/tasks")
TSV = Path("/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv")

# ---- read T005/T056 detail from the TSV, then retarget their component ----
rows = list(csv.DictReader(TSV.open(), delimiter="\t"))
moved = {r["id"]: r for r in rows if r["id"] in ("T005", "T056")}
assert len(moved) == 2
for r in rows:
    if r["id"] in moved:
        r["component"] = "glass-svelte-migration"
with TSV.open("w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys(), delimiter="\t")
    w.writeheader()
    w.writerows(rows)

# ---- U1a: strip T005/T056 from glass-engine-frontdoor ----
fd = WS / "blueprint-glass-engine-frontdoor.md"
t = fd.read_text()
for goal in ("- Migrate LifeOS frontend from Vue to Svelte (§3.1)\n",
             "- Migrate LifeOS to Svelte Glass release target (RV§2)\n"):
    assert goal in t, goal
    t = t.replace(goal, "")
t = re.sub(r"- \[ \] Migrate LifeOS frontend from Vue to Svelte — verified by:[^\n]*\n", "", t)
t = re.sub(r"- \[ \] Migrate LifeOS to Svelte Glass release target — verified by:[^\n]*\n", "", t)
t = re.sub(r"### T005 ·.*?(?=### T\d)", "", t, flags=re.S)
t = re.sub(r"### T056 ·.*?(?=### T\d)", "", t, flags=re.S)
t = t.replace("row(s) T005, ", "row(s) ").replace("T056, ", "")
anchor = "## Obligations (full detail)"
note = ("- **Scope split (verify pass 2026-07-23):** the Vue→Svelte migration itself (T005 §3.1, "
        "T056 RV§2, T165 R01) is owned by [[tasks/blueprint-glass-svelte-migration]]; this task "
        "covers the PTY/xterm/sidebar/routing integration, and T152 (RV§17 step 13) assumes the "
        "sibling's migration half is delivered first.\n\n")
t = t.replace(anchor, note + anchor)
fd.write_text(t)

# ---- U1b: enrich glass-svelte-migration with T005/T056 ----
sm = WS / "blueprint-glass-svelte-migration.md"
t = sm.read_text()
t = t.replace("## Acceptance Criteria",
              "- Migrate LifeOS frontend from Vue to Svelte (§3.1)\n"
              "- Migrate LifeOS to Svelte Glass release target (RV§2)\n\n## Acceptance Criteria")
t = t.replace("## Context",
              f"- [ ] Migrate LifeOS frontend from Vue to Svelte — verified by: {moved['T005']['verification_cmd']}\n"
              f"- [ ] Migrate LifeOS to Svelte Glass release target — verified by: {moved['T056']['verification_cmd']}\n\n## Context",
              1)
t = re.sub(r"row\(s\) (T\d+)", r"row(s) T005, T056, \1", t, count=1)
t += (f"\n### T005 · §3.1 · Migrate LifeOS frontend from Vue to Svelte\n\n{moved['T005']['detail']}\n\n"
      f"*Verification:* {moved['T005']['verification_cmd']}\n"
      f"\n### T056 · RV§2 · Migrate LifeOS to Svelte Glass release target\n\n{moved['T056']['detail']}\n\n"
      f"*Verification:* {moved['T056']['verification_cmd']}\n")
sm.write_text(t)

# ---- U2: pin-currency appendices ----
PINS = {
    "blueprint-rtk-rtk-nu-envelope": [
        "`rtk --version` = 0.43.0 — matches the blueprint pin.",
        "`src/rtk_nu_main.rs` EXISTS in rtk-tokenkill (R18 implementation claim verified present on disk).",
        "DRIFT: rtk-tokenkill checkout is on branch `feat/rtk-full-feature-config` @ 43b93ab, not the pinned develop 44cf84e7 — the INV16 pin gate must re-pin against the branch actually shipping rtk_nu.",
    ],
    "blueprint-codedb-ingress": [
        "nu_plugin HEAD = 931d48f (`Merge pull request #41 … archbp-001-ingest-envelope`) — matches the R17 addendum pin exactly; R19's checkout-staleness for nu_plugin is resolved.",
        "Nushell = 0.113.1 — matches the blueprint's typed-boundary pin.",
        "Still outstanding: R08 (Nu-parse-before-plugin ordering) has not been verified against 931d48f.",
    ],
    "blueprint-envctl-committer-security": [
        "envctl live checkout: branch `codex/profile-xdg-owner-20260721` @ 38f8aba — neither R11's audited rev 48368a97 nor a pinned release; re-audit the drain/embed/commit gap against this rev before implementing.",
    ],
    "blueprint-nix-release-gate": [
        "PRECONDITION NOT MET: `/srv/flexnetos/sources/RuVector/6a6c39e6*` does not exist on this host — the RV§15 hermetic shell requires materializing the pinned RuVector source first.",
        "pg_config/psql are not on the ambient PATH — every PostgreSQL assertion in this task must run inside the Nix closure shell, not the login environment.",
    ],
    "blueprint-postgres-ruvector-store": [
        "pg_config/psql are not on the ambient PATH (2026-07-23) — run the extension/version verifications from inside the hermetic Nix closure (see [[tasks/blueprint-nix-release-gate]]).",
    ],
    "blueprint-ruvllm-agentdb-rvf": [
        "Live registry drift: @ruvector/rvf is at 0.3.0 (installed stack reports 0.2.3; blueprint-era AgentDB ADR text cites 0.1.x) — an explicit version re-pin decision is required at implementation time; do not inherit the ADR's version numbers.",
    ],
    "blueprint-glass-svelte-migration": [
        "Confirmed live (2026-07-23): `package.json` name is `lifeos-vue` with vue-tsc in build/check scripts — R01 remains OPEN; this task's premise holds.",
    ],
}
for stem, lines in PINS.items():
    p = WS / f"{stem}.md"
    body = "\n".join(f"- {l}" for l in lines)
    p.write_text(p.read_text().rstrip() +
                 f"\n\n## Pin currency audit (observed 2026-07-23, verify pass)\n\n{body}\n")

# ---- U5: epic ----
ep = WS / "blueprint-ingestion-epic.md"
t = ep.read_text()
t = t.replace("- [ ] All child tasks listed below exist in this KB with status `backlog`.",
              "- [x] All child tasks listed below exist in this KB with status `backlog`. Evidence: `git-kb board --group-by status --columns backlog,draft,active,completed` → backlog 20 / draft 0 (2026-07-23).")
t = t.replace("- [ ] `git-kb graph tasks/blueprint-ingestion-epic --json` shows every child linked.",
              "- [x] `git-kb graph tasks/blueprint-ingestion-epic --json` shows every child linked. Evidence: 21 nodes / 58 edges.")
t = t.replace("- [ ] The task graph TSV row count matches the blueprint section coverage audit (every `##`/`###`\n      section mapped to ≥1 row or an explicit descriptive entry).",
              "- [x] The task graph TSV row count matches the blueprint section coverage audit. Evidence: 203 rows; `audit-section-coverage.py` exit 0 (52 real headings mapped).")
t = t.replace("- [ ] No child task duplicates scope already delivered by a completed meta-root task without a\n      re-verification criterion (see crosscheck report).",
              "- [x] No child task duplicates scope already delivered by a completed meta-root task without a re-verification criterion (crosscheck Table 1); intra-stream Svelte-migration duplication (T005/T056 vs T165) found in the verify pass and consolidated into [[tasks/blueprint-glass-svelte-migration]].")
t = t.rstrip() + """

## Progress Log

### 2026-07-23
- Stream staged: 20 tasks committed and moved to backlog (KB commits 019f916f-2aff / 019f9170-2e19).
- Verify pass driven through the git-kb surface (board/show/graph/search + probes); pin-currency
  audit appended to 7 child tasks; T005/T056 migration scope consolidated into
  [[tasks/blueprint-glass-svelte-migration]]; native `component` and execution-order `blocked_by`
  metadata added to all children.
- Known tag collision: pre-existing completed task `tasks/rtk-codex-hooks-server-dashboard-icm`
  also carries tag `codex` — filter stream queries by tag AND status (backlog), or by slug prefix.
"""
ep.write_text(t)
print("content upgrades applied")
