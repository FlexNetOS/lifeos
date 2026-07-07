# 02 Authority Graph

## Purpose

The authority graph answers a single question: who is allowed to decide, delegate, execute, and verify each planning object.

v0 uses a narrow graph with explicit escalation instead of a deep corporate hierarchy.

## Core Nodes

| Node | Type | Responsibility |
|---|---|---|
| `lifeos_runtime` | system | Operating environment and object host |
| `noa` | agent | Top-level strategic authority |
| `cecca` | role | Internal CEO-agent role for operational arbitration |
| `planner_agent` | agent | Converts intent into goals and tasks |
| `simulator_agent` | agent | Runs DevWorld simulation |
| `executor_agent` | agent | Executes work inside a hermetic cell |
| `verifier_agent` | agent | Validates proof and completion |

## Edge Types

| Edge | Meaning |
|---|---|
| `delegates_to` | grants bounded work authority |
| `escalates_to` | requests a higher-level decision |
| `verifies` | can accept or reject completion proof |
| `constrains` | can narrow task or cell behavior |

## v0 Authority Chain

```text
LifeOS runtime
  -> hosts NOA
NOA
  -> delegates operational authority to CECCA
CECCA
  -> delegates planning to planner_agent
  -> delegates simulation to simulator_agent
  -> delegates execution to executor_agent
  -> delegates verification to verifier_agent
verifier_agent
  -> can block task completion until proof exists
```

## Invariants

1. NOA remains the top strategic agent.
2. CECCA is the internal CEO-agent role, not a separate company layer.
3. A task cannot be executed by an agent lacking the required capability.
4. A task cannot self-verify completion.
5. Simulation may constrain execution, but may not directly complete a task.
6. Recommendation may not bypass proof requirements.

## Authority Resolution

When a decision is requested:

1. Resolve the task's required role.
2. Resolve the active agent assigned to that role.
3. Confirm the agent has the required capability set.
4. If capability or authority is missing, escalate to CECCA.
5. If CECCA cannot safely resolve scope, escalate to NOA.
