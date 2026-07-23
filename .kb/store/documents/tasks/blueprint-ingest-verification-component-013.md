---
id: 019f8eef-8b1c-7f61-86f5-c0e9f387c828
slug: tasks/blueprint-ingest-verification-component-013
title: "Finalize blueprint verification component"
type: task
status: active
priority: high
parent: tasks/blueprint-ruvector-ingestion-002
tags: [component, icm, blueprint, verification]
---

## Overview

Create a component-level task to harden blueprint verification and health checks.

## Goals

- Guarantee zero-mutation verification semantics.
- Maintain idempotent importer behavior and stable hashes across reruns.
- Preserve stable recall/read-only semantics in verification.

## Implementation

- Verify `--verify-only` path is read-only across recall, stats, and health.
- Re-run importer verification after no-op; assert stable source/raw counts and hashes.
- Confirm `icm health`, `icm stats`, and semantic recall probes pass without writes.

## Acceptance Criteria

- [ ] Two consecutive verify-only runs are identical and no new mutations occur.
- [ ] Source hash list remains stable unless input changes.
- [ ] Semantic recall probes include hard-rule and operational query terms.