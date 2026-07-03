# 03 Task Graph Schema

## Purpose

The task graph is the executable backbone of v0. It captures ordering, authority, constraints, rollback, proof, and simulation-derived restrictions.

## Required Task Fields

Every `Task` must include:

- `allowed_paths`
- `blocked_paths`
- `verification_gate`
- `rollback_plan`
- `proof_uri`

These are mandatory in both the JSON Schema and any real instance.

## Task Lifecycle

| Status | Meaning |
|---|---|
| `draft` | Created but not executable |
| `ready` | Authority and prerequisites satisfied |
| `simulated` | DevWorld constraints applied |
| `running` | Executing inside a hermetic cell |
| `blocked` | Stopped by a failed gate or missing dependency |
| `complete` | Proof recorded and verification passed |
| `rolled_back` | Execution undone per rollback plan |

## Constraint Model

Constraints are part of the task graph, not comments attached to it.

Constraint types:

- path constraints
- tool constraints
- authority constraints
- dependency constraints
- proof constraints
- simulation constraints

## Mutation Rules

1. Humans and agents may create or reorder tasks only while preserving dependency validity.
2. DevWorld may update the graph only by adding or tightening constraints.
3. DevWorld may not mark a task complete.
4. A task may enter `complete` only after proof verification.
5. Rollback plans must exist before `running`.

## Minimal v0 Graph

```text
Task A: capture_intent
  -> Task B: compile_authority_graph
  -> Task C: compile_task_graph
  -> Task D: simulate_in_devworld
  -> Task E: apply_constraints
  -> Task F: execute_in_cell
  -> Task G: record_proof
  -> Task H: recommend_next_action
```
