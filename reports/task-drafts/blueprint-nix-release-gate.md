---
slug: tasks/blueprint-nix-release-gate
title: "Nix hermetic build, runner proofs, and release gate (RV§15)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`nix-release-gate` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Pin terminal-stack versions before activation (§3.1)
- Emit complete runner and build-surface receipts (§4.9)
- Pin repositories to exact 2026-07-19 revisions (RV§2)
- Pin Rust integration-plane crate versions (RV§2)
- Import and build all 196 root workspace members (RV§2)
- Import detached packages and external submodules (RV§2)
- Configure Rust toolchain minimums per workspace (RV§2)
- Run release-gate executables and retain receipts (RV§2)
- Build named binaries with required features (RV§2)
- Build hermetic Nix shell and package extension (RV§15)
- Run full multi-plane build/test matrix (RV§15)
- Gate release via runner proof and atomic activation (RV§15)
- Implement database-gated release pipeline (REL)
- Freeze pins for all new required components (R14)
- Implement runner release gate proofs (DOC)
- Eliminate conflicts and downgrade language before release (INV18)

## Acceptance Criteria

- [ ] Pin terminal-stack versions before activation — verified by: Check bun.lock and Cargo/Nix pins for xterm addons and portable-pty 0.9.0
- [ ] Emit complete runner and build-surface receipts — verified by: A runner job produces a complete receipt row set in the database
- [ ] Pin repositories to exact 2026-07-19 revisions — verified by: git rev-parse of each checkout matches the pinned SHA
- [ ] Pin Rust integration-plane crate versions — verified by: Cargo.lock/cargo tree version audit against pinned coordinates
- [ ] Import and build all 196 root workspace members — verified by: cargo metadata member count matches declared inventory
- [ ] Import detached packages and external submodules — verified by: release manifest lists detached artifacts and submodule commit bytes
- [ ] Configure Rust toolchain minimums per workspace — verified by: rustc --version per workspace meets minimum
- [ ] Run release-gate executables and retain receipts — verified by: receipts present in the database for each gate executable
- [ ] Build named binaries with required features — verified by: cargo build with the stated required feature per target succeeds
- [ ] Build hermetic Nix shell and package extension — verified by: In-shell asserts: cargo pgrx --version = 0.12.9; pg_config --version = PostgreSQL 17.10; pgrx test/package succeed
- [ ] Run full multi-plane build/test matrix — verified by: All listed commands exit 0 with locked inputs
- [ ] Gate release via runner proof and atomic activation — verified by: Release activation row references runner receipts, proof manifest, and rollback target; session survives reload
- [ ] Implement database-gated release pipeline — verified by: flexnetos_runner gate suite; release witness append; approval recorded in database
- [ ] Freeze pins for all new required components — verified by: ref existence, lockfile closure, manifest path, source-byte import checks
- [ ] Implement runner release gate proofs — verified by: flexnetos_runner doctor/release check; proof manifest; clean shell/login tests
- [ ] Eliminate conflicts and downgrade language before release — verified by: structural checks, table consistency, release gates, final full-file reread

## Context

- **Execution order:** 2 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-byte-capture-reconciliation]], [[tasks/blueprint-rtk-rtk-nu-envelope]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-envctl-committer-security]], [[tasks/blueprint-redb-state-plane]], [[tasks/blueprint-codedb-ingress]], [[tasks/blueprint-ruvllm-agentdb-rvf]], [[tasks/blueprint-glass-engine-frontdoor]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T008, T039, T045, T046, T050, T052, T053, T054, T055, T126, T127, T129, T163, T178, T183, T200 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- Spans the lifecycle: hermetic shell and pins at step 2; runner-proved release gates at steps 14–15.

## Obligations (full detail)

### T008 · §3.1 · Pin terminal-stack versions before activation

Exact frontend/addon versions must be frozen in the Bun lock and the `portable-pty` crate pinned in Cargo/Nix before activation.

*Verification:* Check bun.lock and Cargo/Nix pins for xterm addons and portable-pty 0.9.0

### T039 · §4.9 · Emit complete runner and build-surface receipts

Nix defines reproducible build/materialization closures; flexnetos_runner performs database-issued build, test, and release work and emits complete receipts; all compiler/toolchain/GPU/network surfaces (Rust, Bun, cargo-pgrx, CUDA, ONNX Runtime, Candle, network-control/netengine/iroh, etc.) are controlled execution surfaces whose inputs, packets, decisions, outputs, binaries, logs, and device effects return completely to the database.

*Verification:* A runner job produces a complete receipt row set in the database

### T045 · RV§2 · Pin repositories to exact 2026-07-19 revisions

Build from the exact pinned revisions: RuVector main 6a6c39e662a4c3184dcb913db91a09401c84b2ae, agentdb 04968e3fba3bf01ef4e9978d0446485452365a86, ruflo 12ede21767a6dd669df1b79392a5d27d9154f237, lifeos 3d741436, envctl 48368a97, weave b0ccd227, network-control 5341ea00, flexnetos_runner e6ccf713, rusty-idd 4c47c67f, nu_plugin 63d68743, rtk-tokenkill develop 44cf84e7, icm 03d63a91, yazelix 01790ae2, meta afc146fb, upstream rtk f9d8c775, redb reference fe014115.

*Verification:* git rev-parse of each checkout matches the pinned SHA

### T046 · RV§2 · Pin Rust integration-plane crate versions

envctl lifecycle carries PostgreSQL 17.10, server SQL lineage 0.3.0, ruvector-postgres integration coordinate 2.0.5 (repo manifest crate coordinate 2.0.1). The Rust plane pins ruvector-core 2.3.0, ruvector-graph 2.3.0, ruvllm 2.3.0, ruvector-sona 0.2.1, rvf-runtime 0.3.0, rvf-types 0.2.1, and RVF index/quant/crypto 0.2.0.

*Verification:* Cargo.lock/cargo tree version audit against pinned coordinates

### T050 · RV§2 · Import and build all 196 root workspace members

The pinned RuVector root manifest declares 196 member entries (195 unique paths); every member (crates, examples, ruvix, rvAgent, data, etc.) is built, tested, and captured byte-complete as part of the installed architecture.

*Verification:* cargo metadata member count matches declared inventory

### T052 · RV§2 · Import detached packages and external submodules

Detached first-class packages remain installed (ospipe 0.1.0, rvf-examples 0.1.0, micro-hnsw-wasm 2.3.2, ruvllm-esp32 0.3.0, ruvllm-esp32-flash 0.2.0, ruvector-edge-net 0.1.0, ruvector-data-framework 0.3.0, rvf-desktop 2.0.0, sonic_ct 0.1.0, complete RVF workspace, MCP brain server, others); external/ruqu and external/rvdna submodules are imported with their commit/tree bytes and their separate toolchains/artifacts bound into the same release manifest.

*Verification:* release manifest lists detached artifacts and submodule commit bytes

### T053 · RV§2 · Configure Rust toolchain minimums per workspace

The RuVector root toolchain requires Rust minimum 1.77; the detached RVF workspace requires Rust minimum 1.87.

*Verification:* rustc --version per workspace meets minimum

### T054 · RV§2 · Run release-gate executables and retain receipts

The benchmark, correctness, chaos, replay, proof, SOTA ANN, vector-search, hybrid, graph, MinCut, attention, SONA, quantization, temporal-attractor, robotics, hardware, and verified-application packages are release-gate executables; their source bytes, datasets, parameters, outputs, measurements, and receipts are imported and retained under the same contract as production crates.

*Verification:* receipts present in the database for each gate executable

### T055 · RV§2 · Build named binaries with required features

Build ruvector-timesfm-forecast (requires feature candle, in ruvector-timesfm 2.2.4), mcp-brain-server-local (requires feature local), ruvllm-embedder (mcp-brain-server bin), ruvllm-bridge, ruvllm-pi-worker, ruvector-hailo-embed, ruvector-hailo-worker, ruvector-hailo-stats, ruvector-mmwave-bridge (ruvector-hailo-cluster bins; Hailo/mmWave device closures), plus WASM surfaces via wasm-bindgen/wasm-pack and Node surfaces via napi-rs.

*Verification:* cargo build with the stated required feature per target succeeds

### T126 · RV§15 · Build hermetic Nix shell and package extension

Evaluate FlexNetOS/yazelix at 01790ae2292a0060acb015d72e3bec8a21b0b0ef, import its locked nixpkgs, assert x86_64-linux and PostgreSQL 17.10, compose a shell around lifeos_foundation_yzx, build cargo-pgrx 0.12.9 in-closure from pgcentralfoundation/pgrx rev a21888973a18b787fa2c09f86936ea9c4a20de4b (no host cargo-pgrx), materialize RuVector at /srv/flexnetos/sources/RuVector/6a6c39e6..., resolve pg_config from the closure, then cargo pgrx init --pg17, and build/test/package crates/ruvector-postgres with FEATURES="pg17,index-all,quant-all,all-features-v3".

*Verification:* In-shell asserts: cargo pgrx --version = 0.12.9; pg_config --version = PostgreSQL 17.10; pgrx test/package succeed

### T127 · RV§15 · Run full multi-plane build/test matrix

From pinned sources: cargo build/test --workspace --locked on RuVector root and crates/rvf; cargo test crates/ruvllm --locked --features inference-cuda,fused-act,parallel,ruvector-full,mmap,gguf-mmap; bun install --frozen-lockfile + build + test in RuVector npm tree and packages/ruvector (build:napi); wasm-pack build/test --node for ruvector-wasm and rvf-wasm; bun build + test:ci for agentdb and ruflo; nvidia-smi then ruvllm inference-cuda test. CI matrix also runs pg17,index-all,quant-all,graph-complete; NAPI builds outside source dirs into isolated exhaust trees; WASM into separate generated trees; x86_64-unknown-linux-musl for self-contained CLI/worker surfaces while PG/GPU/driver-linked components keep dynamic closures.

*Verification:* All listed commands exit 0 with locked inputs

### T129 · RV§15 · Gate release via runner proof and atomic activation

flexnetos_runner consumes a signed database JobSpec and exact Nix closure, returning raw logs, NDJSON audit, test reports, artifacts, checksums, manifests, CodeDB proof manifest, witnesses, and rollback data; PostgreSQL/RuVector approves the release branch, envctl materializes it, an atomic symlink selects it, and Yazelix/Zellij reloads without destroying the user session. GitKB and meta bind source revisions, package graph, task map, drift record, release graph, and handoff.

*Verification:* Release activation row references runner receipts, proof manifest, and rollback target; session survives reload

### T163 · REL · Implement database-gated release pipeline

Release begins with a database-selected branch and database-issued policy, task, grants, and lease; envctl projects worktree/config/Nix inputs; Nix and compilers produce the closure; flexnetos_runner executes every gate; PostgreSQL/RuVector accepts complete evidence and appends the release witness.

*Verification:* flexnetos_runner gate suite; release witness append; approval recorded in database

### T178 · R14 · Freeze pins for all new required components

rtk_nu, redb-owner, PTY/xterm, and ingest-envelope are required additions without existing pins; activation is explicitly blocked until every new package/lock/schema/witness coordinate is frozen.

*Verification:* ref existence, lockfile closure, manifest path, source-byte import checks

### T183 · DOC · Implement runner release gate proofs

The runner gate proves clean-shell bootstrap, real login-session persistence, envctl table checksums, generated-file checksums, raw logs, absence of tracked raw secrets, meta repository-graph equality, GitKB/handoff update, release manifest, and the next backlog; no activation bypasses provenance.

*Verification:* flexnetos_runner doctor/release check; proof manifest; clean shell/login tests

### T200 · INV18 · Eliminate conflicts and downgrade language before release

Zero unresolved in-scope architecture conflicts, unowned boundaries, invented current capabilities, or silent downgrade language are permitted at release.

*Verification:* structural checks, table consistency, release gates, final full-file reread

