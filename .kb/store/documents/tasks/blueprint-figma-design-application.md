---
id: 019f9282-8cf8-7322-942f-9bcf866932ec
slug: tasks/blueprint-figma-design-application
title: "Apply connected Figma design via MCP into the DESIGN.md token pipeline"
type: task
status: active
priority: high
tags: [blueprint, figma, design, brain-build]
---

## Overview

Master-prompt GOAL line "Connected figma design must be leveraged and applied" had no
covering task in either KB (verified 2026-07-24, phase S coverage check). This task closes
that gap. Route is fixed by the repo's design contract: Figma MCP `get_design_context` →
token deltas applied through `DESIGN.md` (never CSS literals; DESIGN.md wins conflicts) →
`colors_and_type.css` mirrors → exports regenerated.

Part of the blueprint execution stream (meta-root KB `tasks/blueprint-*`); executes inside
phase R of the brain-build run (checkpoint: `.ruvnet-brain/checkpoint.json`).

## Goals

- Pull the connected Figma design context via the Figma MCP server.
- Diff Figma tokens against `DESIGN.md` front-matter tokens; classify each delta
  (apply / reject-with-reason — DESIGN.md is normative on conflict).
- Apply accepted deltas through `DESIGN.md`, regenerate exports, mirror `colors_and_type.css`.

## Acceptance Criteria

- [ ] Figma design context retrieved via MCP (`get_design_context`) and archived as evidence
- [ ] Token diff table committed (Figma vs DESIGN.md, per-token verdict)
- [ ] All accepted deltas land in `DESIGN.md` only; no inline hex introduced anywhere
- [ ] `bun run design:lint` exit 0, 0 errors
- [ ] `bun run design:diff` clean or allowlisted in `scripts/design-diff.allow`
- [ ] `bun run design:export` byte-deterministic outputs committed
- [ ] `bun run test:a11y` 0 violations (32 axe assertions)

## Context

- `DESIGN.md` (repo root) is the normative agent-readable token source (`@google/design.md@0.1.1`).
- Non-negotiable contracts: tokens-not-literals, dark-first, Lexend, Lucide-only icons.
- Gate wiring: phase R gate G4 includes `bun run design:lint`; this task's evidence feeds it.
