---
slug: tasks/blueprint-glass-engine-frontdoor
title: "Glass↔Engine front door: PTY, xterm, sidebar, routing topology (§3.1–3.2, RV§18, R02–R04, R13)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`glass-engine-frontdoor` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Migrate LifeOS frontend from Vue to Svelte (§3.1)
- Implement Tauri PTY controller with exact yzx argv (§3.1)
- Wire xterm.js rendering stack over ordered IPC channels (§3.1)
- Bind PTY session name to database identity (§3.1)
- Render live sidebar from database-backed state (§3.1)
- Wire embedded terminal input path with parallel capture (§3.2)
- Route agent-mediated front door through Codex (§3.2)
- Capture all LifeOS/Codex interactions into the database (§4.2)
- Embed Yazelix via real PTY without reimplementation (§4.3)
- Migrate LifeOS to Svelte Glass release target (RV§2)
- Benchmark commit-to-render latency (RV§12)
- Migrate LifeOS to Tauri/Svelte Glass (step 13) (RV§17)
- Conform to the authority/control routing topology (RV§18)
- Build LifeOS PTY embedding of Yazelix Engine (R02)
- Implement byte-preserving PTY transport with pins (R03)
- Restrict yazelix-terminal-support to metadata role (R04)
- Preserve logical trace alongside physical paths (R13)
- Operate all Section-3 paths after cutover (INV04)
- Require commit identity before UI acknowledgement (A06)

## Acceptance Criteria

- [ ] Migrate LifeOS frontend from Vue to Svelte — verified by: Pinned checkout builds a Svelte (not Vue) shell; release gate
- [ ] Implement Tauri PTY controller with exact yzx argv — verified by: Exact-argv test passes (named release-blocking); PTY frames recorded
- [ ] Wire xterm.js rendering stack over ordered IPC channels — verified by: Inspect frontend: PTY output uses ordered channels; xterm addons present
- [ ] Bind PTY session name to database identity — verified by: Restart Glass and verify reattachment to the same Zellij session
- [ ] Render live sidebar from database-backed state — verified by: Sidebar shows agents, .rvf pressure, tasks, Git, branch state from live projection
- [ ] Wire embedded terminal input path with parallel capture — verified by: Terminal latency unaffected by capture; captured frames byte-match PTY stream
- [ ] Route agent-mediated front door through Codex — verified by: Agent-mediated route traverses Codex; non-agent controls do not
- [ ] Capture all LifeOS/Codex interactions into the database — verified by: Interaction/MCP/model-exchange records present in DB for a test session
- [ ] Embed Yazelix via real PTY without reimplementation — verified by: Editor/shell activity in embedded pane appears in capture plane records
- [ ] Migrate LifeOS to Svelte Glass release target — verified by: release gate: Glass with embedded Yazelix PTY operational
- [ ] Benchmark commit-to-render latency — verified by: Latency benchmark receipts stored; no HTTP live-state server and no PG polling on hot path
- [ ] Migrate LifeOS to Tauri/Svelte Glass (step 13) — verified by: All eight step-13 proofs pass; sidebar renders from mmap generation matching commit events
- [ ] Conform to the authority/control routing topology — verified by: Trace of a command shows each hop in order; no write path to PG exists except through envctl
- [ ] Build LifeOS PTY embedding of Yazelix Engine — verified by: frozen-closure exact-argv, PTY, resize, exit/signal, detach/reconnect tests
- [ ] Implement byte-preserving PTY transport with pins — verified by: binary/UTF-8 split-frame equality, backpressure, render callback, resize, WebGL-fallback tests
- [ ] Restrict yazelix-terminal-support to metadata role — verified by: architecture dependency test rejects it as launcher/renderer
- [ ] Preserve logical trace alongside physical paths — verified by: logical-hop order plus physical path-walk fixtures with identity/lease/branch/raw/local-seq/mmap-generation/commit/witness continuity
- [ ] Operate all Section-3 paths after cutover — verified by: path-walk of all eight physical pipelines (D05–D12)
- [ ] Require commit identity before UI acknowledgement — verified by: D12 completion fixture verifying commit identity and witness ordering

## Context

- **Execution order:** 13 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-nix-release-gate]], [[tasks/blueprint-rtk-rtk-nu-envelope]], [[tasks/blueprint-postgres-ruvector-store]], [[tasks/blueprint-witness-chain]], [[tasks/blueprint-envctl-committer-security]], [[tasks/blueprint-redb-state-plane]], [[tasks/blueprint-codedb-ingress]], [[tasks/blueprint-ruvllm-agentdb-rvf]], [[tasks/blueprint-glass-svelte-migration]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T005, T006, T007, T009, T010, T011, T019, T031, T032, T056, T120, T152, T154, T166, T167, T168, T177, T189, T202 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.


## Obligations (full detail)

### T005 · §3.1 · Migrate LifeOS frontend from Vue to Svelte

The target Glass is an ultra-lightweight Tauri 2/Svelte shell; the current pinned checkout is Vue/Tauri with none of the terminal integration. The Svelte migration is release-blocking work.

*Verification:* Pinned checkout builds a Svelte (not Vue) shell; release gate

### T006 · §3.1 · Implement Tauri PTY controller with exact yzx argv

Build a Tauri Rust PTY controller using portable-pty 0.9.0 running the Nix-pinned argv `yzx enter options --session-name <database-derived-name> --attach-to-session true --on-force-close detach`; it owns the master handle, forwards input/resize, streams ordered byte-array frames to xterm.js, and records start, attach/create, resize, input, output, exit, signal, and error frames.

*Verification:* Exact-argv test passes (named release-blocking); PTY frames recorded

### T007 · §3.1 · Wire xterm.js rendering stack over ordered IPC channels

Use `@xterm/xterm` with `@xterm/addon-fit` and `@xterm/addon-webgl` in the Svelte pane; PTY bytes travel over ordered Tauri IPC channels, not Tauri global events (events are JSON and reserved for small control notices).

*Verification:* Inspect frontend: PTY output uses ordered channels; xterm addons present

### T009 · §3.1 · Bind PTY session name to database identity

The database-derived session name binds tenant/session/branch identity so a restarted Glass reconnects to the same Engine Room.

*Verification:* Restart Glass and verify reattachment to the same Zellij session

### T010 · §3.1 · Render live sidebar from database-backed state

The Glass left sidebar must project live agents, per-agent `.rvf` memory pressure, tasks, sessions, Git state, and PostgreSQL/RuVector branch state.

*Verification:* Sidebar shows agents, .rvf pressure, tasks, Git, branch state from live projection

### T011 · §3.2 · Wire embedded terminal input path with parallel capture

Path: User → LifeOS/xterm → ordered Tauri channel → PTY stdin → yzx enter → Zellij → Nushell/process. In parallel the PTY bridge submits byte-exact CodeDB raw-frame envelopes (input, resize, output, exit, signal, error) to the redb owner under the issued session identity/grant/lease without delaying or reordering terminal delivery; LifeOS never inserts rtk_nu, redb, or a Nushell plugin in front of the terminal process.

*Verification:* Terminal latency unaffected by capture; captured frames byte-match PTY stream

### T019 · §3.2 · Route agent-mediated front door through Codex

Codex is the mandatory intent-handling hop for the anchor's agent-mediated LifeOS front-door route and one database-controlled agent surface in the Engine Room; it is not an artificial hop for non-agent UI controls, and direct query/projection/envctl/runner/security routes retain the same capture and return contract.

*Verification:* Agent-mediated route traverses Codex; non-agent controls do not

### T031 · §4.2 · Capture all LifeOS/Codex interactions into the database

Every LifeOS/Codex interaction, MCP call, model exchange, PTY frame, decision, mapped generation, and rendered state is captured; the Svelte sidebar renders the owner-published redb mmap generation using the ordered event as wakeup; neither LifeOS nor Codex owns operational truth; the Vue frontend is current-state evidence that must be migrated, not the target contract.

*Verification:* Interaction/MCP/model-exchange records present in DB for a test session

### T032 · §4.3 · Embed Yazelix via real PTY without reimplementation

LifeOS embeds the Nix-owned Zellij runtime via `yzx enter` through a real PTY and does not reimplement it; keystroke-derived commands, input bytes, resize events, buffer changes, save operations, paths, file effects, diagnostics, terminal output, exit state, and reconnection state round-trip through the capture plane.

*Verification:* Editor/shell activity in embedded pane appears in capture plane records

### T056 · RV§2 · Migrate LifeOS to Svelte Glass release target

LifeOS current checkout is Vue/Tauri (src-tauri, lifeos-core, lifeos-daemon, lifeos-vue; Vue 3, Vite, Pinia, Tauri 2, Bun 1.3.14); the target/release gate adds Svelte Glass, a PTY controller, the yzx enter lifecycle/attach contract, and a redb-owner event client.

*Verification:* release gate: Glass with embedded Yazelix PTY operational

### T120 · RV§12 · Benchmark commit-to-render latency

LifeOS verifies and reads the mapped generation from owner events (sequence, transaction, table/key scope, generation, active slot, checksum) and requests a fresh snapshot only on schema mismatch, missing generation, checksum failure, or recovery; mmap reads plus Unix-socket events replace HTTP server and PostgreSQL polling on the hot path. Commit-to-render latency must be benchmarked; sub-millisecond is an acceptance target, not an assumed guarantee.

*Verification:* Latency benchmark receipts stored; no HTTP live-state server and no PG polling on hot path

### T152 · RV§17 · Migrate LifeOS to Tauri/Svelte Glass (step 13)

Migrate LifeOS from the current Vue checkout to Tauri/Svelte Glass; add the Rust PTY controller, embed real `yzx enter`/Zellij Engine Room, bind the sidebar to the redb-owner mmap projection plus matching commit events. Prove atomic generation publication, mapped-byte/checksum equality, stale-reader and owner-restart recovery, input/resize/output fidelity, no local HTTP live-state server, no direct concurrent redb database-file open, and the canonical CodeDB/envctl/PostgreSQL return route.

*Verification:* All eight step-13 proofs pass; sidebar renders from mmap generation matching commit events

### T154 · RV§18 · Conform to the authority/control routing topology

Wire the bidirectional graph exactly: Glass↔Tauri PTY↔yzx enter/Zellij; LifeOS control → complete CodeDB request envelope → redb owner → envctl → PostgreSQL authorization → controlled dispatch; legacy raw output → rtk_nu byte-exact tee (lossless raw frames + digest identity, plus rtk compact view); native Nu values bypass RTK; Nushell typed values → required codedb ingest-envelope child → redb single owner → (ordered local event/snapshot → sidebar) and (envctl validation → envctl-only codedb-store-pg → PostgreSQL); PostgreSQL → envctl-controlled projection → redb owner → mmap/event → Glass and Engine; granted typed read/query to Nushell; every raw byte, effect, result, ack, and witness returns to PostgreSQL. envctl holds the only authoritative write capability.

*Verification:* Trace of a command shows each hop in order; no write path to PG exists except through envctl

### T166 · R02 · Build LifeOS PTY embedding of Yazelix Engine

No LifeOS PTY exists; `yzx enter` execs the pinned Zellij. Implement portable-pty 0.9.0, exact `yzx enter options ...` argv, database-derived session, and attach/detach/reconnect ownership.

*Verification:* frozen-closure exact-argv, PTY, resize, exit/signal, detach/reconnect tests

### T167 · R03 · Implement byte-preserving PTY transport with pins

Assign PTY byte arrays to ordered Tauri channels, xterm.js/WebGL to rendering, and small notices only to Tauri events; portable-pty 0.9.0 and xterm pins are mandatory (Tauri events are JSON and not high-throughput).

*Verification:* binary/UTF-8 split-frame equality, backpressure, render callback, resize, WebGL-fallback tests

### T168 · R04 · Restrict yazelix-terminal-support to metadata role

yazelix-terminal-support (rev a7ee555a) is metadata only and explicitly does not launch/render/compose/repair; LifeOS owns the PTY bridge.

*Verification:* architecture dependency test rejects it as launcher/renderer

### T177 · R13 · Preserve logical trace alongside physical paths

Restore the exact ten-hop logical front-door trace (D05) while retaining eight convergent physical paths (D06–D12); Codex is mandatory on the agent-mediated front door but not every non-agent control.

*Verification:* logical-hop order plus physical path-walk fixtures with identity/lease/branch/raw/local-seq/mmap-generation/commit/witness continuity

### T189 · INV04 · Operate all Section-3 paths after cutover

The Tauri/Svelte Glass embeds the real `yzx enter`/Zellij Engine through a PTY, and every action, ingestion, live-projection, durable-commit, and controlled return path in §3 operates after cutover.

*Verification:* path-walk of all eight physical pipelines (D05–D12)

### T202 · A06 · Require commit identity before UI acknowledgement

The convergent Engine/Glass return, ingestion, durable commit, and acknowledgement loop (D12) requires PostgreSQL commit identity and witness before the final UI acknowledgement.

*Verification:* D12 completion fixture verifying commit identity and witness ordering

