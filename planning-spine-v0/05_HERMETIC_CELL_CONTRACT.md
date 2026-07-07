# 05 Hermetic Cell Contract

## Purpose

The hermetic cell is the smallest runtime envelope allowed to execute a task. It exists to keep execution bounded, auditable, and rollback-aware.

## Cell Guarantees

1. Inputs are declared before execution.
2. Allowed paths are explicit.
3. Blocked paths are explicit.
4. Toolchain surface is explicit.
5. Produced artifacts are enumerable.
6. Proof hooks are available before task completion.

## Required Contract Fields

| Field | Meaning |
|---|---|
| `boundary` | Runtime trust and isolation description |
| `inputs` | Declared task inputs |
| `outputs` | Expected result classes |
| `toolchain` | Allowed commands or runtimes |
| `allowed_paths` | Writable/readable paths explicitly permitted |
| `blocked_paths` | Paths that must not be touched |
| `verification_gate` | Completion condition for work done in the cell |

## v0 Design

v0 is hermetic, not container-first.

That means:

- bounded filesystem access is required,
- explicit tool access is required,
- reproducible runtime assumptions are required,
- Docker is not required.

## Execution Rule

No cell may report success unless the task's verification gate passes and at least one proof record is written to the proof ledger.
