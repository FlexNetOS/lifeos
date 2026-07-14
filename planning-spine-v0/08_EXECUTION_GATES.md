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

## Human-Approval Gates

Some work is too consequential to be gated by proof alone. The following categories are **denied by default** and require **explicit human approval** — recorded before the action runs — no matter how complete the proof chain is. No agent may self-approve any of them.

| Trigger category | Requires human approval | Denied by default |
|---|---|---|
| Spend (money, cost, billable resource use) | yes | yes |
| Legal (contracts, licenses, regulatory-facing action) | yes | yes |
| Credentials (reading/writing/rotating/transmitting secrets or tokens) | yes | yes |
| Production deployment (mutating production or user-facing state) | yes | yes |
| Physical action (hardware, devices, shipping, robotics) | yes | yes |
| Irreversible work (destructive deletes, external publication, no rollback path) | yes | yes |

These gates are **fail-closed**: absence of a recorded human approval is a denial, not a default-allow. Spend, legal, credentials, production deployment, physical action, and irreversible work each stay blocked until a human explicitly approves the specific action. The machine-readable form of this gate class lives in `schemas/gates.yaml` under `human_approval_gate`, alongside the transition-matrix gates.

## v0 Enforcement Principle

No execution path is considered done because an agent says it is done. Done is a state transition guarded by proof. Consequential or irreversible action is additionally guarded by an explicit human-approval gate. Both default to deny.
