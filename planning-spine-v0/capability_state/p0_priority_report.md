# CAP-001 P0 Priority Report

Observed at: 2026-07-06T17:22:41Z

Active control surface:

- Google Doc thread: `AAAB-0ICCJc`
- Active Google Sheet: `1LYeO7PA64Fg7d0Gi2PLs7661zxwgOITg5GCSJS4oPBI`
- Active Sheet thread: `AAAB_HbRiho` / CN-006
- Archived Sheet: `1hqQ_FU3lEl-T9sBQZkwSmN1KRCZq32Z3BVL5TaJGOfU`

Priority lock:

CAP-001 remains the current P0. The task graph still requires communication bridge workstreams to stay ahead of broader architecture expansion, and old LPS sheet watermarks remain stopped.

Live lane map:

| Lane | Helper id | Active task | Artifact target | Status | Blocker |
|---|---|---|---|---|---|
| A | `/root/lps017_readiness` | OPS-001 heartbeat/status | `state/heartbeat_lane_a.json`, `connector_state/heartbeat_lane_b.json`, `proof_records/OPS-001.proof.json` | Pass | None; heartbeat artifacts are now materialized in-package |
| B | `/root/lps017_readiness/lps018_readiness/drive_watchdog/cn006_lane_b_conn001` | CONN-001 connector build | `connector_state/connector_current_state.md`, `connector_state/connector_current_state.json`, `connector_state/build_report.json`, `connector_state/connection_report.json`, `connector_state/connector_tree_snapshot.txt`, `connector_proof/CONN-001.proof.json` | Verified package; blocked for build/connection | Zip is a spec/task pack only; no buildable connector source, MCP gateway, `/mcp` endpoint, or ChatGPT app/tunnel confirmation |
| C | `/root/lps017_readiness/lps018_readiness/drive_watchdog/cn006_lane_c_weave001` | WEAVE-001 evaluation | `weave_state/weave_bus_evaluation.md`, `weave_state/weave_bus_evaluation.json`, `proof_records/WEAVE-001.proof.json` | Evaluation pass; blocked for live adoption | Clean pack PATH resolves `envctl`, `git-kb`, and `codex`, but not `weave` or `cargo`; source repo has bus primitives and heartbeat design |
| D | `/root` | CAP-001 status/control | `capability_state/p0_priority_report.md`, `capability_state/p0_priority_report.json`, `proof_records/CAP-001.proof.json` | Pass | None; report refreshed to reflect current package state |

Current next decision:

Treat A as complete for the current package pass. Preserve B as proof-backed but blocked on missing implementation source. Preserve C as evaluation-complete but blocked for live adoption until an owned clean-prefix `weave` frontdoor exists. Keep CAP-001 reporting current without broadening architecture or mutating production control paths.

Proof notes:

- CN-006 remains the active sheet thread anchor for this workstream.
- Sheet rows for `CAP-001`, `OPS-001`, `CONN-001`, and `WEAVE-001` were previously read from the active reset sheet, and the package artifact targets still match that control surface.
- `OPS-001` artifacts are now materialized:
  - `state/heartbeat_lane_a.json`
  - `connector_state/heartbeat_lane_b.json`
  - `docs/heartbeat_notes.md`
  - `proof_records/OPS-001.proof.json`
- `CONN-001` remains exact-package verified and blocked on missing implementation source.
- `WEAVE-001` remains evaluation-complete and blocked for live adoption.
- All writes for this refresh stayed inside `planning-spine-v0/**`.
