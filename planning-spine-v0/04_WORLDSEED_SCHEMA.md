# 04 WorldSeed Schema

## Purpose

`WorldSeed` is the exact simulation input package passed to DevWorld. It freezes the task context so simulation results are reproducible and can be compared across runs.

## Required Contents

| Field | Meaning |
|---|---|
| `intent_id` | Root intent being simulated |
| `task_id` | Concrete task under evaluation |
| `environment_snapshot` | Relevant world and repo state |
| `assumptions` | Explicit assumptions being tested |
| `hypotheses` | Predicted outcomes or failure cases |
| `constraints` | Current hard boundaries before simulation |
| `simulator_version` | DevWorld build identity |
| `generated_at` | Creation timestamp |

## Simulation Contract

DevWorld consumes `WorldSeed` and produces a `SimulationReport`.

The report must:

- describe observed outcomes,
- emit concrete `constraint_updates`,
- identify rejected paths,
- preserve evidence references.

The report must not:

- directly execute the task,
- directly mutate artifacts,
- directly mark the task complete,
- replace authority decisions with advice-only prose.

## Constraint Propagation Rule

Simulation output updates the task graph as constraints, not advice. If DevWorld learns that a path is unsafe or invalid, that information becomes machine-readable graph state before execution continues.
