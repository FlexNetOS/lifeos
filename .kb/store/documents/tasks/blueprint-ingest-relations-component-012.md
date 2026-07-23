---
id: 019f8eef-85a9-7dc1-bd9c-4fd4dce16d32
slug: tasks/blueprint-ingest-relations-component-012
title: "Finalize blueprint relations component"
type: task
status: active
priority: high
parent: tasks/blueprint-ruvector-ingestion-002
tags: [component, icm, blueprint, relations]
---

## Overview

Create a component-level task to validate evidence-backed blueprint concept relations.

## Goals

- Keep relation types limited to supported ontology types and blueprint evidence.
- Prevent synthetic/implicit edges.
- Ensure relation targets are valid and linked.

## Implementation

- Review relation synthesis in `scripts/ingest-architecture-blueprint-icm.mjs`.
- Validate graph export and edge integrity checks.
- Add regression checks for target-existence and relation type constraints.

## Acceptance Criteria

- [ ] Only supported types are emitted.
- [ ] All edges resolve to existing concepts/memories in export.
- [ ] Every asserted edge is backed by source evidence/chunk evidence references.