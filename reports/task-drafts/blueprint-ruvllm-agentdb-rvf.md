---
slug: tasks/blueprint-ruvllm-agentdb-rvf
title: "ruvllm, AgentDB, RVF container integration (§4.10, RV§7–8)"
type: task
status: draft
priority: high
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`ruvllm-agentdb-rvf-integration` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Use ruvllm/Candle as default embedding path (§4.7)
- Integrate the cognition stack under database ownership (§4.10)
- Pin npm @ruvector binding versions (RV§2)
- Install AgentDB 3.0.0-alpha.18 RVF-first backend (RV§7)
- Project all 24 AgentDB native table families (RV§7)
- Enforce AgentDB vs PostgreSQL ownership split (RV§7)
- Implement RVF container format contract (RV§7)
- Deploy shared frozen foundation model (RV§8)
- Build ruvllm with required features and device path (RV§8)
- Configure RuvLTRA model profiles (RV§8)
- Configure quantization and cache controls (RV§8)
- Wire database-approved MicroLoRA hot-swap (RV§8)
- Install and use the complete ruvnet inventory (INV09)

## Acceptance Criteria

- [ ] Use ruvllm/Candle as default embedding path — verified by: Embedding executor resolves to Candle path; ONNX only via approved closure
- [ ] Integrate the cognition stack under database ownership — verified by: Model I/O, .rvf bytes, learned generations, and forecast evidence present in database
- [ ] Pin npm @ruvector binding versions — verified by: lockfile/package.json audit against pinned versions
- [ ] Install AgentDB 3.0.0-alpha.18 RVF-first backend — verified by: AgentDB version check; feedback identifiers link memory results to updates
- [ ] Project all 24 AgentDB native table families — verified by: all 24 table families present in the canonical schema
- [ ] Enforce AgentDB vs PostgreSQL ownership split — verified by: Audit: branch/promotion pointer changes originate only from lifeos_runtime/lifeos_release procedures; .rvf containers carry no durable-ownership rows
- [ ] Implement RVF container format contract — verified by: rvf-integration-tests pass including two-fsync crash recovery
- [ ] Deploy shared frozen foundation model — verified by: multi-agent sharing check; model digest stable across agents
- [ ] Build ruvllm with required features and device path — verified by: cargo build of ruvllm with the stated feature list succeeds
- [ ] Configure RuvLTRA model profiles — verified by: both profiles load and serve a smoke inference
- [ ] Configure quantization and cache controls — verified by: memory/throughput benchmark under the quantized configuration
- [ ] Wire database-approved MicroLoRA hot-swap — verified by: adapter swap is gated by a database approval record
- [ ] Install and use the complete ruvnet inventory — verified by: pinned locked build/test per component; fixture; byte/provenance/witness round trip

## Context

- **Execution order:** 9 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-install-activation-order]], [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-data-schema]], [[tasks/blueprint-cow-branching]], [[tasks/blueprint-envctl-committer-security]], [[tasks/blueprint-sona-rl]], [[tasks/blueprint-ruflo-ruvltra-atas]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T037, T040, T047, T092, T093, T095, T097, T098, T099, T100, T101, T102, T193 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- Grounding caveat: AgentDB ADR-003 (RVF format integration) and ADR-010 (rvf-solver deep integration) are PROPOSED design intent per agentdb/docs/adrs/ — verified-functional npm packages (@ruvector/rvf-node 12/12 ops) but do not treat the AgentDB-side integration as shipped.

## Obligations (full detail)

### T037 · §4.7 · Use ruvllm/Candle as default embedding path

ruvllm/Candle is the default approved local embedding path for envctl-orchestrated embedding; ONNX/ort is optional only in a separately approved closure.

*Verification:* Embedding executor resolves to Candle path; ONNX only via approved closure

### T040 · §4.10 · Integrate the cognition stack under database ownership

ruvllm runs shared frozen foundation models, local inference, and embeddings (CPU/SIMD, Candle, ONNX/ort, CUDA, GGUF mmap, quantized); AgentDB manages active agent cognition projected as signed single-file `.rvf` containers via the RVF runtime; SONA, MicroLoRA, FastGRNN, Thompson Sampling, Q-Learning, PPO, GNNs learn and route from captured evidence under database promotion gates; Ruflo orchestrates swarms; RuvLTRA supplies temporal reasoning paths; ATAS runs timeline forecasting. Their state never displaces database ownership and forecasts never self-promote.

*Verification:* Model I/O, .rvf bytes, learned generations, and forecast evidence present in database

### T047 · RV§2 · Pin npm @ruvector binding versions

Pin npm ruvector 0.1.2, @ruvector/core 0.1.31 (native platforms 0.1.29), @ruvector/wasm 0.1.31, @ruvector/router 0.1.30, @ruvector/gnn 0.1.25, @ruvector/attention 0.1.4 (attention WASM 0.1.32), @ruvector/ruvllm 2.6.1 (native NAPI 2.0.1, WASM 2.0.2), @ruvector/sona 0.1.8 (native 0.1.5), @ruvector/rvf 0.3.0, @ruvector/postgres-cli 0.2.9; Ruflo's JavaScript plane consumes @ruvector/ruvllm 2.6.1-family packages.

*Verification:* lockfile/package.json audit against pinned versions

### T092 · RV§7 · Install AgentDB 3.0.0-alpha.18 RVF-first backend

Install AgentDB 3.0.0-alpha.18 as the active cognition surface: RvfBackend, semantic routing, SONA, temporal compressor, contrastive training, federated sessions, causal memory, MinCut, GNN/attention, adaptive solvers, Reflexion, SkillLibrary, NightlyLearner, and recall certificates, with retrieval feedback identifiers connecting each memory result to quality, reward, failure, and learned projection updates.

*Verification:* AgentDB version check; feedback identifiers link memory results to updates

### T093 · RV§7 · Project all 24 AgentDB native table families

Preserve the memory family (episodes, episode_embeddings, skills, skill_links, skill_embeddings, facts, notes, note_embeddings, events, consolidated_memories), experience graph (exp_nodes, exp_edges, exp_node_embeddings, memory_scores, memory_access_log, consolidation_runs), and causal/learning frontier (causal_edges, causal_experiments, causal_observations, recall_certificates, provenance_sources, justification_paths, learning_experiences, learning_sessions) in the relational projection.

*Verification:* all 24 table families present in the canonical schema

### T095 · RV§7 · Enforce AgentDB vs PostgreSQL ownership split

AgentDB retains active memory, agent-specific state, SONA matrices, MicroLoRA adapters, FastGRNN routing graphs, witness chains, RL state, versions, signatures, and portable identity while PostgreSQL/RuVector controls tasks, policy, branches, promotion, and durable ownership.

*Verification:* Audit: branch/promotion pointer changes originate only from lifeos_runtime/lifeos_release procedures; .rvf containers carry no durable-ownership rows

### T097 · RV§7 · Implement RVF container format contract

Implement RVF as the portable single-file cognitive container using 64-byte alignment, 24 segment kinds, progressive HNSW layers, quantized sections, COW_MAP, MEMBERSHIP, WITNESS_SEG, and CRYPTO segments, append-only generations, and two-fsync recovery, built from the detached workspace (rvf-types 0.2.1, rvf-runtime 0.3.0, rvf-index/quant/crypto 0.2.0, wire, manifest, kernel, Node, WASM, server, import, launch, eBPF, CLI, federation, solver, adapters for Ruflo/AgentDB/OSpipe/agentic-flow/rvlite/SONA).

*Verification:* rvf-integration-tests pass including two-fsync crash recovery

### T098 · RV§8 · Deploy shared frozen foundation model

Map one shared frozen foundation model once and serve multiple agents with per-agent KV-cache, MicroLoRA, SONA, routing, memory, and policy state, giving VRAM-efficient multi-agent execution with stable model identity across comparisons.

*Verification:* multi-agent sharing check; model digest stable across agents

### T099 · RV§8 · Build ruvllm with required features and device path

Build ruvllm with default features async-runtime, candle, routing-metrics, quantize, hub-download; integrated builds additionally enable attention, graph, gnn, ruvector-full, parallel, mmap, gguf-mmap, fused-act, and the selected device path (inference-cuda, inference-metal, metal-compute, coreml, or hybrid-ane); runtime paths include Candle CPU/SIMD, Candle CUDA, ONNX/ort, GGUF mmap, CUDA fused activation, Metal/ANE, NAPI, WASM, sparse attention, retrieval diffusion, and Hailo edge workers.

*Verification:* cargo build of ruvllm with the stated feature list succeeds

### T100 · RV§8 · Configure RuvLTRA model profiles

Configure RuvLTRA-Small as the 494M-parameter/32K-context profile and RuvLTRA-Medium as the 3B/256K profile; Ruflo and ATAS use them for proportional-intelligence routing and global temporal forecasting.

*Verification:* both profiles load and serve a smoke inference

### T101 · RV§8 · Configure quantization and cache controls

Configure TurboQuant, scalar/product/binary quantization, 2-bit and 4-bit KV-cache quantization, H2O/PyramidKV, paged attention, X-LoRA, and ISQ to control memory and throughput.

*Verification:* memory/throughput benchmark under the quantized configuration

### T102 · RV§8 · Wire database-approved MicroLoRA hot-swap

MicroLoRA adapters hot-swap by database-approved agent, task, domain, branch, and generation.

*Verification:* adapter swap is gated by a database approval record

### T193 · INV09 · Install and use the complete ruvnet inventory

ruvnet/rUv, RuVector, AgentDB, RVF, ruvllm, RuvLTRA, SONA, MicroLoRA, FastGRNN, Ruflo, ATAS, and every official crate/package in the inventory must be installed and used, not replaced.

*Verification:* pinned locked build/test per component; fixture; byte/provenance/witness round trip

