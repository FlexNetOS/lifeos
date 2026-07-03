# RFC-001 DevWorld Mirofish Adapter

## Status

`RFC` only. Not part of v0 implementation.

## Problem

DevWorld needs a stable way to exchange simulation inputs and outputs with a richer world-modeling substrate without making v0 depend on a full standalone Mirofish build.

## Proposal

Define a narrow adapter that:

- accepts a `WorldSeed`,
- maps it to a Mirofish-compatible simulation envelope,
- receives simulated outcomes,
- converts them back into a `SimulationReport` with constraint updates.

## Out of Scope

- standalone Mirofish runtime packaging,
- broad Mirofish UX,
- general external simulator marketplace.

## Open Design Points

- adapter transport shape,
- world-state normalization,
- deterministic replay contract,
- proof linkage between adapter runs and proof ledger entries.
