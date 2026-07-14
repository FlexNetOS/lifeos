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
- `task_graph.source.csv` is the human-reviewable 22-task source graph. No row
  uses draft status: work is either ready, blocked on an explicit dependency,
  or complete with proof.
- `generated/` contains the raw, normalized, indexed, and validation-report
  forms compiled by the Planning Spine's existing task-graph scripts.
- `proof_records/YZXCONV-001.proof.json` seals the completed code-intelligence
  baseline; later proof records are intentionally absent until their tasks run.

## Regeneration

From `planning-spine-v0`, invoke the checked-in regenerator with the one
profile's RTK and Nushell binaries:

```text
/home/flexnetos/.nix-profile/bin/rtk proxy \
  /home/flexnetos/.nix-profile/toolbin/nu \
  scripts/regenerate-yazelix-runtime-convergence.nu
```

The package is complete as a plan when normalization passes and every explicit
request maps to at least one task and one verification gate.

Runtime convergence is complete only after `YZXCONV-020` has a passing proof
record, including the explicit Yazelix musl and Home Manager gates in
`YZXCONV-021` and `YZXCONV-022`.
