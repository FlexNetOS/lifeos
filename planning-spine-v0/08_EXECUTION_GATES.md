# 08 Execution Gates

## Gate Model

Execution gates are hard transition checks. They are not optional diagnostics.

## Required Gates

| Gate | Trigger | Pass condition |
|---|---|---|
| `authority_gate` | Before task readiness | assigned agent has role and capability |
| `simulation_gate` | Before execution | latest DevWorld constraint update applied |
| `cell_gate` | Before running | hermetic cell contract resolved |
| `proof_gate` | Before completion | proof record exists and verifies |
| `decision_gate` | Before recommendation publication | next action derived from verified state |

## Transition Matrix

| From | To | Required gate |
|---|---|---|
| `draft` | `ready` | `authority_gate` |
| `ready` | `simulated` | `simulation_gate` |
| `simulated` | `running` | `cell_gate` |
| `running` | `complete` | `proof_gate` |
| `complete` | `next_action_published` | `decision_gate` |

## Blocking Rules

1. Missing authority blocks readiness.
2. Missing simulation constraint application blocks execution.
3. Missing hermetic cell contract blocks execution.
4. Missing proof blocks completion.
5. Proof failure reopens the task as blocked or rolled back.

## v0 Enforcement Principle

No execution path is considered done because an agent says it is done. Done is a state transition guarded by proof.
