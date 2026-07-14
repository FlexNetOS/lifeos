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
7. Network access is denied by default.
8. A pre-execution snapshot boundary is declared so the cell can be restored.
9. A rollback plan is declared before execution.

## Required Contract Fields

| Field | Meaning |
|---|---|
| `boundary` | Runtime trust and isolation description |
| `inputs` | Declared task inputs |
| `outputs` | Expected result classes |
| `toolchain` | Allowed commands or runtimes |
| `allowed_paths` | Writable/readable paths explicitly permitted |
| `blocked_paths` | Paths that must not be touched |
| `network` | Network policy; `default_policy` is `denied` unless hosts are explicitly allow-listed |
| `snapshot_boundary` | Pre-execution snapshot mode and scope used to restore the cell on failure |
| `rollback_plan` | How the cell reverts its effects when the verification gate does not pass |
| `verification_gate` | Completion condition for work done in the cell |

## Isolation Boundaries

1. **Network denied by default.** A cell has no network access unless `network.default_policy` is `allowed` and specific hosts are enumerated in `network.allowed_hosts`. The MVP cell ships `denied` with an empty allow-list.
2. **Snapshot boundary.** Before execution, the cell snapshots its `allowed_paths` (`snapshot_boundary.mode = required`). The snapshot is the restore point if the proof gate fails.
3. **Rollback.** `rollback_plan` states how the cell reverts — restoring the pre-execution snapshot and discarding cell outputs — whenever the verification gate does not pass.

## v0 Design

v0 is hermetic, not container-first.

That means:

- bounded filesystem access is required,
- explicit tool access is required,
- reproducible runtime assumptions are required,
- Docker is not required.

## Execution Rule

No cell may report success unless the task's verification gate passes and at least one proof record is written to the proof ledger.
