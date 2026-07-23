---
id: 019f8eef-74ec-76b1-b0a5-b23883fd18cf
slug: tasks/blueprint-ingest-embedding-component-011
title: "Finalize blueprint embedding component"
type: task
status: active
priority: high
parent: tasks/blueprint-ruvector-ingestion-002
tags: [component, icm, blueprint, embedding]
---

## Overview

Create a component-level task to harden cascade embedding behavior for blueprint chunks.

## Goals

- Enforce Two-model cascade: MiniLM + Jina with 1152-dim vectors.
- Scope embedding regeneration only to blueprint topic IDs.
- Keep verify-only path read-only and strict on dimensional mismatches.

## Implementation

- Validate config wiring in profile `.config/icm/config.toml` for fast/code models.
- Confirm importer calls `icm embed --topic` for blueprint scopes.
- Add/verify strictness checks when embeddings are missing or wrong-sized in verify mode.

## Acceptance Criteria

- [ ] All blueprint vectors are 1152-dim.
- [ ] `--verify-only` fails on missing/wrong embeddings.
- [ ] Embed pass affects only blueprint topic memories.