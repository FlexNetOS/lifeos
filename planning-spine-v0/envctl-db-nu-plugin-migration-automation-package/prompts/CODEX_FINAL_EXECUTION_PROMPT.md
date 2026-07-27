# CODEX FINAL EXECUTION PROMPT — envctl + nu_plugin migration automation

You are Codex running locally on Ubuntu 26.04+.

Package root to use:

```bash
cd ~/envctl-db-nu-plugin-migration-automation-package
```

Mission:
Build the final product by executing the package's database-backed migration automation design against the real local repos. This is real execution only. No simulation. No demo. No fabricated repo structure. No destructive migration without explicit approval.

Critical navigation and execution order:
1. Read `README.md` first, especially `Agent navigation + backtrace metadata`.
2. Confirm `history/v0` through `history/v5` exist and preserve upgrade-only/no-downgrade lineage.
3. Use `execution-framework/generated/task_graph.csv` as the source of task truth.
4. Validate `execution-framework/generated/execution_manifest.json` against the graph, then use it to resolve JSON packets under `execution-framework/generated/execution_packets/`.
5. Treat each JSON packet as the complete task instruction. Do not replace packet execution with a hand-authored task plan or prompt.
6. Recompute current state from `execution-framework/proof_records/proof_ledger.jsonl`; never assume a hard-coded starting task.
7. Dispatch only tasks whose declared dependencies are complete. Respect each packet's `can_run_parallel`, `parallel_group`, `max_parallel`, `start_after`, approval, and single-thread constraints.
8. For a failed task, inspect its latest proof and log, fix the evidenced failure within that packet's allowed paths, and rerun that packet before unblocking dependents.
9. After every attempt, write the task proof and update the append-only proof ledger. Regenerate merged proof/status views before selecting more work.
10. Continue automatically until all tasks are complete or a genuine external/approval blocker prevents progress. Do not ask for a manual prompt between packets.

Package baseline (verify it; current proof/status files supersede this snapshot):
- Live Drive bookkeeping gaps from `DEEP_VERSION_GAP_ANALYSIS_2026-07-04_envctl_package` are closed.
- Maintenance packets/proofs exist for README backtrace navigation, proof template restore, live manifest/verification sync, and final Codex handoff.
- `execution-framework/proof_templates/PROOF_RECORD_TEMPLATE.json` is present.
- `final_verification_report.json` status is `pass_no_gaps_drive_live_synchronized`.
- Implementation and verification state may have advanced since packaging. Trust the latest valid proof per task, not this prose.

Required local repos:
- envctl repo path: inspect the user's local target, do not invent it.
- nu_plugin repo path: inspect the user's local target, do not invent it.

If repo paths are not provided by command-line args or environment variables, stop with `HARD STOP — REPO_PATHS_NOT_PROVIDED` and list the exact missing values. Do not create fake repos.

Bootstrap commands to run from package root before dispatch:

```bash
cd execution-framework
python3 scripts/validate_task_graph.py generated/task_graph.csv
python3 scripts/task_graph_to_packets.py generated/task_graph.csv
python3 scripts/goal_loop.py generated/task_graph.csv
python3 scripts/verify_history_and_completeness.py
```

Then read `generated/status_report.json` and `state/goal_loop_state.json`, execute the listed dispatch packets, and repeat the goal loop after each completed bounded batch. If no packets are dispatchable while tasks are incomplete, report the exact failed dependency, approval gate, or external blocker from proof evidence.

If the package was extracted somewhere other than `~/envctl-db-nu-plugin-migration-automation-package`, use the actual extracted package root. Adapt only the path prefix; do not change task IDs or contract semantics.

Implementation objective:
Make envctl database features perform the migration process as built-in, agent-controllable CLI/database tooling, with nu_plugin as the live human/agent control and visualization surface.

Minimum product deliverables:
1. envctl migration automation database schema/migrations.
2. envctl target descriptor registry/parser/validator.
3. envctl migration recipe loader.
4. envctl operation/event ledger.
5. envctl artifact contract registry.
6. envctl approval/checkpoint/rollback/replay model.
7. envctl adapter to import/use this package and the prior FlexNetOS package as real fixtures.
8. nu_plugin commands for live status, visual tables, graph views, approvals, replay, artifacts, and run control.
9. Shared protocol schemas between envctl and nu_plugin.
10. Tests proving run creation, event append, artifact registration, approval flow, replay, and plugin output.
11. Final verification showing no package/task/packet/proof gaps and no downgrade.

Policy:
- Upgrade-only. No downgrade.
- Additive first. Preserve source history.
- Do not expose secrets.
- Every task requires a proof record.
- Every claimed completion must cite changed files, commands run, verification output, and rollback path.
- If a command fails because dependencies are missing, record the exact command and exact blocker in the proof record.

Completion gate:
The job is not done until:
- `execution-framework/generated/status_report.json` shows all required implementation tasks complete or explicitly blocked with evidence.
- `execution-framework/generated/final_verification_report.json` reports no unresolved gaps.
- `execution-framework/proof_records/proof_ledger.jsonl` includes every completed task.
- envctl and nu_plugin repo checks have been run or exact blockers recorded.
- README, manifest, task graph, execution manifest, JSON packets, and proof ledger agree.

Final response format:
Return concise completion report with changed files, commands run, tests/verification, blockers if any, and next executable task if not complete.
