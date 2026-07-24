---
slug: tasks/blueprint-glass-svelte-migration
title: "LifeOS Glass Vue→Svelte migration (R01, §3.1)"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex]
parent: tasks/blueprint-ingestion-epic
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[tasks/blueprint-ingestion-epic]]). Implements the
`glass-svelte-migration` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

- Migrate LifeOS Glass from Vue to Svelte (R01)

## Acceptance Criteria

- [ ] Migrate LifeOS Glass from Vue to Svelte — verified by: build closure rejects Vue entrypoint and proves Svelte target

## Context

- **Execution order:** 13 (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** [[tasks/blueprint-glass-engine-frontdoor]]
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) T165 in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
- R19 (2026-07-23) re-affirmed OPEN: package.json still has "vue": "^3.5.34". This task is release-blocking everywhere. The in-repo CLAUDE.md/AGENTS.md contracts still describe the Vue app; the migration supersedes them per the blueprint's authority.

## Obligations (full detail)

### T165 · R01 · Migrate LifeOS Glass from Vue to Svelte

Current checkout (revision 3d741436) is Vue 3/Pinia/Vite + Tauri while Tauri/Svelte is the authority; Vue→Svelte is a release-blocking migration everywhere. R19 re-affirmed OPEN with package.json still "vue": "^3.5.34".

*Verification:* build closure rejects Vue entrypoint and proves Svelte target

