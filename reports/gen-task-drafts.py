#!/usr/bin/env python3
"""Generate KB task drafts (one per component) from blueprint-task-graph.tsv.

Every draft must pass the cold-start test: Overview, Goals, Acceptance Criteria
(one checkbox per obligation with its verification), Context (execution order,
dependencies, verify-first notes, grounding), and the full Obligations detail.
"""
import csv, sys
from collections import defaultdict
from pathlib import Path

BASE = Path("/home/flexnetos/meta/src/lifeos/reports")
OUT = BASE / "task-drafts"
TSV = BASE / "blueprint-task-graph.tsv"
EPIC = "tasks/blueprint-ingestion-epic"

META = {
    # component: (slug-suffix, title, priority, execution_order, extra context lines)
    "install-activation-order": ("install-activation-order", "Install/activation order spine (RV§17 steps 1–15)", "critical", 1, [
        "This task is the ordering spine: its 15 numbered steps sequence every sibling task. Authority gates are sequential (PostgreSQL health → schema → CodeDB parity → import → cognition → executors → LifeOS → release); work within a level may run concurrently.",
    ]),
    "byte-capture-reconciliation": ("byte-capture-reconciliation", "Byte-capture and reconciliation contract (RV§19, §2)", "critical", 1, [
        "Cross-cutting: capture-before-transform governs every other component; its gates run at steps 1, 8, and 14–15.",
    ]),
    "nix-release-gate": ("nix-release-gate", "Nix hermetic build, runner proofs, and release gate (RV§15)", "critical", 2, [
        "Spans the lifecycle: hermetic shell and pins at step 2; runner-proved release gates at steps 14–15.",
    ]),
    "rtk-rtk-nu-envelope": ("rtk-rtk-nu-envelope", "rtk / rtk_nu byte-exact tee and versioned envelope (§3.4, R06–R07)", "critical", 2, [
        "VERIFY-FIRST: meta-root task `tasks/architecture-rtk-nu-adapter` is marked completed, and review-ledger addendum R18 records an implementation at rtk-tokenkill `src/rtk_nu_main.rs` (envelope `flexnetos.rtk_nu.envelope.v1`). Per operational invariant 16 the gate is NOT narrowed: rtk_nu is not 'implemented' until exact revision, schema, package closure, and witness are pinned. Independently audit the claimed implementation before building on it.",
    ]),
    "postgres-ruvector-store": ("postgres-ruvector-store", "PostgreSQL 17.10 + RuVector canonical store (§4.1, RV§3)", "critical", 3, [
        "VERIFY-FIRST: completed tasks `tasks/yzx-iso/t4-1-postgres-datadir` and `tasks/yzx-iso/t4-2-ruvector-ext` claim PG 17.10 + extension installed. Treat as untrusted until re-verified (`SELECT extversion FROM pg_extension WHERE extname='ruvector'`).",
        "Grounding: ruvector/crates/ruvector-postgres/docs/ARCHITECTURE.md (SIMD dispatch, vector types, distance operators); crates/ruvector-postgres/docs/SQL_FUNCTIONS_REFERENCE.md.",
    ]),
    "witness-chain": ("witness-chain", "SHAKE256 witness chains and anti-bluff (RV§10, INV12)", "high", 5, []),
    "data-schema": ("data-schema", "Canonical data schema, migrations 0001–0016, RLS and guards (RV§16)", "critical", 5, [
        "R16 records the `authorization` → `authorization_context` reserved-word fix as already applied to the migration SQL; re-verify the fix is present before running migrations.",
    ]),
    "cow-branching": ("cow-branching", "Copy-on-write branching, merge gates, pointer promotion (RV§6, INV11)", "high", 5, []),
    "redb-state-plane": ("redb-state-plane", "flexnetos-redb-owner, mmap projection, geometry plane (§3.3, RV§12, R05)", "critical", 6, [
        "VERIFY-FIRST: completed task `tasks/yzx-iso/t4-3-redb-plane` claims redb wiring; the blueprint's R05 says the owner/mmap publisher did not exist. Audit what actually exists before building.",
    ]),
    "envctl-committer-security": ("envctl-committer-security", "envctl sole committer, drain/embed/commit loop, six secret subsystems (§4.7, §5, RV§13, R10–R11)", "critical", 6, [
        "VERIFY-FIRST: completed tasks `tasks/yzx-iso/t4-4-envctl-committer` and `t4-6-secret-plane` claim committer routing and secret migration; R11 says the drain/embed/commit worker was absent at rev 48368a97 (envctl now on branch codex/profile-xdg-owner per R19). Re-audit against the live checkout.",
    ]),
    "codedb-ingress": ("codedb-ingress", "nu_plugin / CodeDB byte-complete ingress and ingest-envelope (§3.4, RV§14, R08–R09)", "critical", 7, [
        "VERIFY-FIRST: completed task `tasks/yzx-iso/t4-7-byte-complete` claims byte-complete verification; R17 addendum records `codedb ingest-envelope` implemented at nu_plugin @931d48f (schema codedb.ingest-envelope.v0) with the release gate NOT narrowed, and R19 flags R08 unverified against that revision. Independent audit first.",
    ]),
    "retrieval-indexing": ("retrieval-indexing", "Retrieval, HNSW/IVF indexing, embedding projections (RV§4, RV§16)", "high", 8, []),
    "coordination-surfaces": ("coordination-surfaces", "Coordination projections: Git/GitKB/meta/ICM/weave/rusty-idd/RuVix (§4.8, RV§20)", "high", 8, []),
    "ruvllm-agentdb-rvf-integration": ("ruvllm-agentdb-rvf", "ruvllm, AgentDB, RVF container integration (§4.10, RV§7–8)", "high", 9, [
        "Grounding caveat: AgentDB ADR-003 (RVF format integration) and ADR-010 (rvf-solver deep integration) are PROPOSED design intent per agentdb/docs/adrs/ — verified-functional npm packages (@ruvector/rvf-node 12/12 ops) but do not treat the AgentDB-side integration as shipped.",
    ]),
    "sona-rl": ("sona-rl", "SONA, MicroLoRA, FastGRNN, RL promotion gates (RV§9)", "high", 9, []),
    "graph-gnn-causal": ("graph-gnn-causal", "Graph, GNN, causal, MinCut architecture (RV§5)", "high", 9, []),
    "ruflo-ruvltra-atas": ("ruflo-ruvltra-atas", "Ruflo swarms, RuvLTRA temporal reasoning, ATAS forecasting (RV§11)", "high", 9, []),
    "glass-svelte-migration": ("glass-svelte-migration", "LifeOS Glass Vue→Svelte migration (R01, §3.1)", "critical", 13, [
        "R19 (2026-07-23) re-affirmed OPEN: package.json still has \"vue\": \"^3.5.34\". This task is release-blocking everywhere. The in-repo CLAUDE.md/AGENTS.md contracts still describe the Vue app; the migration supersedes them per the blueprint's authority.",
    ]),
    "glass-engine-frontdoor": ("glass-engine-frontdoor", "Glass↔Engine front door: PTY, xterm, sidebar, routing topology (§3.1–3.2, RV§18, R02–R04, R13)", "critical", 13, []),
}

rows_by_comp = defaultdict(list)
with TSV.open() as f:
    for r in csv.DictReader(f, delimiter="\t"):
        if r["codex_ready"] != "yes":
            continue
        comp = "coordination-surfaces" if r["component"] == "other" else r["component"]
        rows_by_comp[comp].append(r)

missing = set(rows_by_comp) - set(META)
if missing:
    print("components without META:", missing)
    sys.exit(1)

OUT.mkdir(exist_ok=True)
slugs = {}
for comp, (suffix, title, prio, order, notes) in META.items():
    slugs[comp] = f"tasks/blueprint-{suffix}"

for comp, rows in sorted(rows_by_comp.items(), key=lambda kv: META[kv[0]][3]):
    suffix, title, prio, order, notes = META[comp]
    slug = slugs[comp]
    dep_comps = set()
    for r in rows:
        for d in r["depends_on"].replace(" ", "").split(","):
            d = "coordination-surfaces" if d == "other" else d
            if d and d != "none" and d != comp and d in slugs:
                dep_comps.add(d)
    dep_links = ", ".join(f"[[{slugs[d]}]]" for d in sorted(dep_comps, key=lambda c: META[c][3]))
    goals = "\n".join(f"- {r['title']} ({r['blueprint_section']})" for r in rows)
    criteria = "\n".join(f"- [ ] {r['title']} — verified by: {r['verification_cmd']}" for r in rows)
    obligations = "\n".join(
        f"### {r['id']} · {r['blueprint_section']} · {r['title']}\n\n{r['detail']}\n\n*Verification:* {r['verification_cmd']}\n"
        for r in rows)
    notes_md = "\n".join(f"- {n}" for n in notes)
    body = f"""---
slug: {slug}
title: "{title}"
type: task
status: draft
priority: {prio}
tags: [blueprint, ruvector, codex]
parent: {EPIC}
---

## Overview

Component task in the blueprint-ingestion stream (parent: [[{EPIC}]]). Implements the
`{comp}` component of
`/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`.
Staged by Fable 5 for execution by Codex; claim by moving status to `active`.

## Goals

{goals}

## Acceptance Criteria

{criteria}

## Context

- **Execution order:** {order} (from the blueprint's numbered install/activation order, RV§17 / integration table). Do not start implementation before lower-numbered component tasks have their gates green; work within the same order number may run concurrently.
- **Depends on component tasks:** {dep_links or 'none'}
- **Binding constraints:** the blueprint's 21 HARD EXECUTION RULES and 19 Operational invariants govern this task in full; the broader interpretation governs every ambiguity, and an edit conflicting with them is invalid. Read the blueprint sections named per obligation below before implementing.
- **Machine-readable source:** row(s) {', '.join(r['id'] for r in rows)} in `/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv`.
- **Operating constraint (owner directive):** previously completed planning-spine tasks and green test suites are untrusted claims until independently audited — lead with verification, not assumption.
{notes_md}

## Obligations (full detail)

{obligations}
"""
    (OUT / f"blueprint-{suffix}.md").write_text(body)
    print(f"{slug}: {len(rows)} obligations, order {order}, priority {prio}")

print(f"\ndrafts={len(rows_by_comp)} (+1 epic already drafted)")
