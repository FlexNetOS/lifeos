---
slug: tasks/blueprint-ingestion-epic
title: "Blueprint ingestion epic — RuVector architecture task stream"
type: task
status: draft
priority: critical
tags: [blueprint, ruvector, codex, epic]
---

## Overview

Parent epic for the component-level task stream extracted from
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`
(the normative architecture and data-pipeline authority for the lifeos repository, itself anchored
to `Architecture_Data_Pipeline_Graph_ANCHORED_VERIFIED(3).md`, SHA-256 `abd36f1c…`). Every child
task implements one major component of the blueprint. This epic does not carry implementation
work itself; it exists so the whole stream is discoverable, ordered, and traceable.

Tasks were staged by Fable 5 for execution by Codex. The machine-readable task graph lives at
`/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`; the conflict/gap cross-check
against the pre-existing 207 meta-root KB tasks lives at
`/home/flexnetos/meta/src/lifeos/reports/blueprint-task-crosscheck.md`.

## Goals

- Every actionable obligation in the blueprint is covered by exactly one child task (or an
  explicit "descriptive — no action" entry in the task graph).
- Child tasks are self-contained: a cold-start agent can execute any of them from the document
  body alone.
- Dependency order between components is explicit via `depends_on` frontmatter/wikilinks and the
  task-graph TSV.

## Acceptance Criteria

- [ ] All child tasks listed below exist in this KB with status `backlog`.
- [ ] `git-kb graph tasks/blueprint-ingestion-epic --json` shows every child linked.
- [ ] The task graph TSV row count matches the blueprint section coverage audit (every `##`/`###`
      section mapped to ≥1 row or an explicit descriptive entry).
- [ ] No child task duplicates scope already delivered by a completed meta-root task without a
      re-verification criterion (see crosscheck report).

## Context

- The blueprint's **21 HARD EXECUTION RULES** and **19 Operational invariants** bind every child
  task; each child copies the rules relevant to its component into its own Context section.
- Operating constraint (owner directive): previously "completed" planning-spine tasks and green
  test suites are **untrusted claims until independently audited**. Child tasks covering scope
  that a completed task already claims (e.g. `tasks/architecture-rtk-nu-adapter`,
  `tasks/yzx-iso/t4-*`) therefore lead with an independent verification criterion, not an
  assumption of done.
- Status flow for children: `draft` → `backlog` only. Codex claims tasks by moving them to
  `active`; nothing here is pre-claimed.

## Children

(populated at KB-creation time with [[wikilinks]] to each child task)
