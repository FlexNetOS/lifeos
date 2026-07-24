---
slug: tasks/blueprint-sona-rl
title: "SONA, MicroLoRA, FastGRNN, RL promotion gates (RV§9)"
type: task
status: draft
priority: high
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`sona-rl` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Implement SONA learning stack without base mutation (RV§9)
- Wire the full RL learning loop (RV§9)
- Configure RL algorithm roles with database caps (RV§9)
- Version all learning outputs by branch (RV§9)
- Persist RL state with witnessed pointer activation (RV§9)

## Acceptance Criteria

- [ ] Implement SONA learning stack without base mutation — verified by: base model digest unchanged after a learning cycle
- [ ] Wire the full RL learning loop — verified by: a loop run produces a recorded promotion or rollback decision
- [ ] Configure RL algorithm roles with database caps — verified by: exploration test confirms database constraint caps are enforced
- [ ] Version all learning outputs by branch — verified by: branch-scoped learning versions are queryable
- [ ] Persist RL state with witnessed pointer activation — verified by: activation occurs only via witnessed pointer update; prior state replays

## Context

- **Execution order:** 9 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-cow-branching]], [[tasks/blueprint-ruvllm-agentdb-rvf]], [[tasks/blueprint-graph-gnn-causal]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T104, T105, T106, T107, T108 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.


## Obligations (full detail)

### T104 · RV§9 · Implement SONA learning stack without base mutation

Implement SONA (Self-Optimizing Neural Architecture) combining BaseLoRA, MicroLoRA, EWC++, a trajectory buffer, ReasoningBank, instant learning, background consolidation, and Rust/NAPI/WASM execution, learning from database-grounded episodes without mutating the frozen base model.

*Verification:* base model digest unchanged after a learning cycle

### T105 · RV§9 · Wire the full RL learning loop

Wire: captured request+route+retrieval+inference+execution+result → reward/quality/safety/cost/latency/success-threshold/failure-pattern → Thompson Sampling / Q-Learning / SARSA / DQN / A2C / PPO / Decision Transformer / Curiosity / REINFORCE updates → SONA matrix + MicroLoRA delta + FastGRNN route + ranking-policy branch → replay, causal, MinCut, witness, build, and task evaluation → database-controlled promotion or rollback.

*Verification:* a loop run produces a recorded promotion or rollback decision

### T106 · RV§9 · Configure RL algorithm roles with database caps

Thompson Sampling selects routes and tools with safety Beta distributions and cost/latency estimates; Q-Learning, SARSA, DQN learn action values; PPO and A2C update bounded policies; Decision Transformer learns trajectories; Curiosity and REINFORCE expand exploration while database constraints cap impact; FastGRNN provides low-latency recurrent context and proportional-intelligence routing.

*Verification:* exploration test confirms database constraint caps are enforced

### T107 · RV§9 · Version all learning outputs by branch

Performance-based ranking changes, success thresholds, failure-pattern learning, adapter updates, policy matrices, and promotion decisions are versioned by branch.

*Verification:* branch-scoped learning versions are queryable

### T108 · RV§9 · Persist RL state with witnessed pointer activation

PostgreSQL/RuVector stores each episode, observation, action, reward component, return, advantage, probability, value estimate, gradient/delta, EWC constraint, matrix/tensor, adapter bytes, route, replay result, promotion gate, rollback, and witness; a learned state becomes active only through a witnessed database pointer update and earlier states remain replayable.

*Verification:* activation occurs only via witnessed pointer update; prior state replays

