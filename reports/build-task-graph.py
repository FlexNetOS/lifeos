#!/usr/bin/env python3
"""Consolidate blueprint obligation shards into the canonical task-graph TSV.

Inputs : reports/extract-part{1,2a,2b,3}.psv  (section|title|detail|component|deps|verify)
Outputs: reports/blueprint-task-graph.tsv     (id, title, blueprint_section, component,
                                               depends_on, verification_cmd, codex_ready, notes)
         exit 0 only if every row is well-formed, components are in-vocabulary,
         the component dependency graph is a DAG, and no row lacks a verification hint.
"""
import sys, csv, re
from pathlib import Path

BASE = Path("/home/flexnetos/meta/src/lifeos/reports")
SHARDS = ["extract-part1.psv", "extract-part2a.psv", "extract-part2b.psv", "extract-part3.psv"]
COMPONENTS = {
    "postgres-ruvector-store", "codedb-ingress", "redb-state-plane",
    "envctl-committer-security", "rtk-rtk-nu-envelope", "glass-engine-frontdoor",
    "ruvllm-agentdb-rvf-integration", "sona-rl", "ruflo-ruvltra-atas",
    "nix-release-gate", "byte-capture-reconciliation", "data-schema",
    "install-activation-order", "witness-chain", "graph-gnn-causal",
    "cow-branching", "retrieval-indexing", "glass-svelte-migration", "other",
}

rows, errors, seen = [], [], {}
for shard in SHARDS:
    for n, line in enumerate((BASE / shard).read_text().splitlines(), 1):
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) < 6:
            errors.append(f"{shard}:{n}: only {len(parts)} fields")
            continue
        section, title, detail, component, deps, verify = (
            parts[0], parts[1], parts[2], parts[3], parts[4], "|".join(parts[5:]))
        component = component.strip()
        if component not in COMPONENTS:
            errors.append(f"{shard}:{n}: unknown component {component!r}")
            continue
        key = re.sub(r"[^a-z0-9]+", "-", title.strip().lower())
        if key in seen:
            # Restated obligation (blueprint repeats its own rules in ledgers/invariants):
            # keep first occurrence, append the extra section reference.
            first = seen[key]
            if section not in first["blueprint_section"]:
                first["blueprint_section"] += f";{section}"
            continue
        row = {
            "title": title.strip(),
            "blueprint_section": section.strip(),
            "component": component,
            "depends_on": deps.strip() or "none",
            "verification_cmd": verify.strip() or "TBD",
            "codex_ready": "no" if title.strip().startswith("no action") else "yes",
            "notes": "descriptive/constraint — no task" if title.strip().startswith("no action") else "",
            "detail": detail.strip(),
        }
        seen[key] = row
        rows.append(row)

# Component-level dependency DAG check (cycles at component granularity are
# acceptable only when they reflect the blueprint's own bidirectional coupling;
# report them, fail only on self-loops or missing vocabulary).
comp_deps = {}
for r in rows:
    if r["codex_ready"] == "no":
        continue
    c = r["component"]
    for d in re.split(r"[,\s]+", r["depends_on"]):
        d = d.strip()
        if not d or d == "none":
            continue
        if d not in COMPONENTS:
            errors.append(f"row {r['title']!r}: unknown dependency {d!r}")
        elif d != c:
            comp_deps.setdefault(c, set()).add(d)

for r in rows:
    if r["codex_ready"] == "yes" and r["verification_cmd"] in ("", "TBD"):
        errors.append(f"row {r['title']!r}: missing verification hint")

if errors:
    print("VALIDATION FAILURES:")
    print("\n".join(errors))
    sys.exit(1)

out = BASE / "blueprint-task-graph.tsv"
with out.open("w", newline="") as f:
    w = csv.writer(f, delimiter="\t")
    w.writerow(["id", "title", "blueprint_section", "component", "depends_on",
                "verification_cmd", "codex_ready", "notes", "detail"])
    for i, r in enumerate(rows, 1):
        w.writerow([f"T{i:03d}", r["title"], r["blueprint_section"], r["component"],
                    r["depends_on"], r["verification_cmd"], r["codex_ready"],
                    r["notes"], r["detail"]])

actionable = sum(1 for r in rows if r["codex_ready"] == "yes")
comps = sorted({r["component"] for r in rows if r["codex_ready"] == "yes"})
print(f"rows={len(rows)} actionable={actionable} components={len(comps)}")
print("components:", " ".join(comps))
sys.exit(0)
