# 07 MVP Vertical Slice

## Target

The first implementation target is exactly this path:

`intent -> authority graph -> task graph -> DevWorld simulation -> hermetic cell -> proof ledger -> next-action recommendation`

## End-to-End Flow

1. `Intent` is created from user direction.
2. `Goal` is attached to the intent.
3. `Authority Graph` resolves NOA, CECCA, and the executing agents.
4. `Task Graph` is compiled with path boundaries, gates, rollback, and proof destinations.
5. `WorldSeed` is generated for the chosen task.
6. `SimulationReport` returns machine-readable constraints.
7. The task graph is updated with those constraints.
8. The chosen task executes in a `Cell`.
9. `Artifact` and `ProofRecord` objects are written.
10. `Decision` selects the next move.
11. `Action` represents the next executable step.

## Minimal Dataflow

```text
Intent
  -> Goal
  -> Authority assignment
  -> Task graph
  -> WorldSeed
  -> SimulationReport
  -> Task graph constraint patch
  -> Cell execution
  -> Artifact + ProofRecord
  -> Decision
  -> Action
```

The package-local machine-readable proof surface for this path lives at `examples/mvp-bundle.json`. Verification must resolve that manifest against the canonical v0 example objects, emit `state/mvp_bundle_report.json` with cross-object linkage results, and emit `state/authority_integrity_report.json` proving that the verifier authority resolves to explicit agent, role, and capability objects before proof-backed completion is accepted.

## MVP Acceptance Criteria

- A valid intent instance exists.
- Authority is resolved through NOA and CECCA.
- At least one task is simulation-constrained before execution.
- Execution occurs inside a hermetic cell contract.
- Proof is recorded before task completion.
- The final recommendation is derived from proof-backed state.

## Explicit Deferrals

The MVP does not include:

- full Odysseus wiring,
- full Hermes wiring,
- full org chart modeling,
- standalone Mirofish runtime,
- generalized multi-company delegation.
