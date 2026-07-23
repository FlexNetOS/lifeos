---
id: 019f8eef-9132-7350-b3e7-361d3944eaf8
slug: tasks/blueprint-ingest-envctl-component-014
title: "Finalize blueprint envctl component"
type: task
status: active
priority: high
parent: tasks/blueprint-ruvector-ingestion-002
tags: [component, icm, blueprint, envctl]
---

## Overview

Create a component-level task to align envctl/XDG/root state requirements for the blueprint ingestion stack.

## Goals

- Keep config and runtime ownership under profile-owned canonical paths.
- Ensure environment migration tooling is compatible with blueprint ingestion hooks.
- Reconcile staged payload transitions when roots change.

## Implementation

- Verify envctl-owned ICM config and migration scripts are coherent with current blueprint ingestion assumptions.
- Confirm no credential leakage remains in tracked/untracked local projection paths.
- Validate cutover/finalize gates and required env vars for stable operation.

## Acceptance Criteria

- [ ] No plaintext credentials in repo-facing staged projection paths.
- [ ] XDG/state migration tool gates reflect current source paths.
- [ ] Ingestion and verification commands run after cutover.