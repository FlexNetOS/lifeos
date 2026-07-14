# Yazelix Runtime Convergence

This package turns the 2026-07-13 four-repository GitNexus audit and live
runtime audit into an executable Planning Spine task graph. It is planning and
proof material only; it does not authorize profile mutation, agent-env apply,
desktop replacement, branch publication, or deletion of historical Nix profile
generations.

## Contents

- `PLAN.md` defines the target ownership model, waves, and completion gates.
- `EVIDENCE.md` records the current source, graph, profile, binary, config, and
  shell findings used to derive the work.
- `task_graph.source.csv` is the human-reviewable YZXCONV projection of the
  canonical rows in `../generated/task_graph.source.csv`.
- `generated/` contains the raw, normalized, indexed, and validation-report
  forms compiled by the Planning Spine's existing task-graph scripts.
- `../proof_records/YZXCONV-001.proof.json` seals the completed
  code-intelligence baseline in the canonical append-only ledger; later proof
  records are intentionally absent until their tasks run.

The canonical graph is authoritative. Verification compares its 15 YZXCONV
rows field-for-field with this focused projection, validates both graph outputs
against `../schemas/task-graph-row.schema.json`, and confirms the completed
baseline proof is present in the canonical ledger.

## Regeneration

From `planning-spine-v0`:

```text
python3 scripts/extract-task-graph.py \
  yazelix_runtime_convergence/task_graph.source.csv \
  --output yazelix_runtime_convergence/generated/task_graph.raw.json
python3 scripts/normalize-task-graph.py \
  yazelix_runtime_convergence/generated/task_graph.raw.json \
  --output yazelix_runtime_convergence/generated/task_graph.normalized.json \
  --index yazelix_runtime_convergence/generated/task_graph.index.json \
  --report yazelix_runtime_convergence/generated/task_graph.normalize_report.json
```

The focused index intentionally reports `LPS-003` as an external parent.
That parent resolves in the canonical graph, where all 15 YZXCONV rows are
rooted in the Planning Spine and covered by the normal lifecycle projection.

The package is complete as a plan when normalization passes and every explicit
request maps to at least one task and one verification gate. Runtime convergence
is complete only after `YZXCONV-015` has a passing proof record.
