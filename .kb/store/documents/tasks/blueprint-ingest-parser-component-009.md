---
id: 019f8eef-671d-7af3-ac56-e529a230bfed
slug: tasks/blueprint-ingest-parser-component-009
title: "Finalize blueprint parser/chunker component"
type: task
status: active
priority: high
parent: tasks/blueprint-ruvector-ingestion-002
tags: [component, icm, blueprint, parser]
---

## Overview

Create a component-level task to harden the blueprint ingestion parser/chunker so every source byte is preserved and section ordering is deterministic.

## Goals

- Preserve exact source bytes for all sections/chunks from the blueprint.
- Ensure section-topic mapping is stable and repeatable across re-runs.
- Maintain deterministic chunk boundaries with explicit max-byte bounds and line provenance.

## Implementation

- Validate `scripts/ingest-architecture-blueprint-icm.mjs` chunk builder logic against `section_inventory` boundaries.
- Verify byte/line accounting for each chunk against source totals.
- Keep parser behavior additive and idempotent with stable IDs.

## Acceptance Criteria

- [ ] Re-run importer does not create duplicate parser artifacts when no source changes.
- [ ] Source-byte and source-line coverage remains full and stable.
- [ ] Parser output includes section identifiers and stable topics.