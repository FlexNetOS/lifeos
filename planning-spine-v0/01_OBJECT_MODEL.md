# 01 Object Model

## Required Schemas

The planning spine is built from these machine-readable entities:

| Schema | Purpose |
|---|---|
| `Intent` | User or system aim entering the spine |
| `Goal` | Durable objective derived from an intent |
| `Agent` | Executing or deciding entity |
| `Role` | Authority-bearing responsibility envelope |
| `Capability` | Named ability an agent can exercise |
| `Task` | Constrained unit of execution |
| `Cell` | Hermetic runtime boundary for execution |
| `WorldSeed` | Simulation input package for DevWorld |
| `SimulationReport` | Constraint-producing simulation output |
| `ProofRecord` | Evidence record tied to a subject |
| `Decision` | Chosen branch with rationale and proof |
| `Action` | Next executable step |
| `Artifact` | Output emitted by execution |

## Relationship Summary

```text
Intent
  -> Goal
  -> Decision

Goal
  -> Task[*]

Agent
  -> Role[*]
  -> Capability[*]

Role
  -> Capability[*]
  -> Decision scope

Task
  -> Cell
  -> WorldSeed
  -> SimulationReport
  -> Action[*]
  -> Artifact[*]
  -> ProofRecord[*]

SimulationReport
  -> Task graph constraint updates

Decision
  -> Action
```

## Modeling Rules

1. `Intent` is the root business object for the vertical slice.
2. `Goal` refines an `Intent` into measurable desired state.
3. `Agent` never acts without both a `Role` and `Capability`.
4. `Task` is the smallest execution-bearing unit and must always carry path constraints, a verification gate, a rollback plan, and a proof URI.
5. `WorldSeed` simulates the task against a frozen context snapshot.
6. `SimulationReport` modifies future execution by adding constraints to the task graph.
7. `ProofRecord` is required before a task can be completed.
8. `Decision` and `Action` are separate: decision chooses; action executes.

## Ownership Boundaries

| Concern | v0 owner |
|---|---|
| Intent intake | LifeOS |
| Strategic authority | NOA |
| Internal CEO arbitration | CECCA |
| Simulation | DevWorld |
| Hermetic execution | Cell runtime |
| Completion proof | Proof ledger |
| Recommendation | Decision engine constrained by proof |
