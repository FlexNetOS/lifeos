---
id: 019f8eef-6e57-7b03-96e3-3f01d4091752
slug: tasks/blueprint-ingest-storage-component-010
title: "Finalize blueprint memory/concept component"
type: task
status: active
priority: high
parent: tasks/blueprint-ruvector-ingestion-002
tags: [component, icm, blueprint, memory]
---

## Overview

Create a component-level task to validate memory + concept creation behavior for the blueprint importer.

## Goals

- Ensure generic memory fields remain canonical (`topic`, `content`, `raw`, `importance`, `keywords`).
- Ensure concept materialization uses stable identifiers and labels.
- Keep dedupe/idempotence guarantees for memories and concepts.

## Implementation

- Review memory upsert flow and concept existence checks in `scripts/ingest-architecture-blueprint-icm.mjs`.
- Verify counts and uniqueness against canonical keys.
- Confirm no synthetic/unsafe edges from importer side.

## Acceptance Criteria

- [ ] Re-ingest with unchanged source is no-op in counts.
- [ ] 209 memories and 104 concepts remain stable.
- [ ] Concepts attach correctly to chunk topics without duplication.