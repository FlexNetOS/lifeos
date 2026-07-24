#!/usr/bin/env python3
"""Audit: every real blueprint heading maps to >=1 task-graph row (or a declared
descriptive/constraint mapping). Exits 0 only on full coverage."""
import csv, re, sys
from pathlib import Path

BP = Path("/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md")
TSV = Path("/home/flexnetos/meta/src/lifeos/reports/blueprint-task-graph.tsv")

# Real headings only: skip fenced code blocks.
headings, fenced = [], False
for line in BP.read_text().splitlines():
    if line.startswith("```"):
        fenced = not fenced
        continue
    if not fenced and re.match(r"^#{1,3} ", line):
        headings.append(line.strip())

tokens = set()
with TSV.open() as f:
    for row in csv.DictReader(f, delimiter="\t"):
        for tok in row["blueprint_section"].split(";"):
            tokens.add(tok.strip())

def sec_covered(prefix):
    return any(t == prefix or t.startswith(prefix + ".") for t in tokens)

failures = []
in_ruvector = False
for h in headings:
    text = re.sub(r"^#+\s*", "", h)
    if text.startswith("RUVECTOR/RUVNET FULL COMPONENT ARCHITECTURE"):
        in_ruvector = True
        continue  # container heading
    if re.match(r"Architecture & Data Pipeline Blueprint", text):
        continue  # document title
    if text.startswith("HARD EXECUTION RULES"):
        # Constraint block: copied into every task's Context, not a task itself.
        continue
    m = re.match(r"(\d+)\.(\d+)\s", text)
    if m and not in_ruvector:
        if not sec_covered(f"§{m.group(1)}.{m.group(2)}") and not sec_covered(f"§{m.group(1)}"):
            failures.append(h)
        continue
    m = re.match(r"(\d+)\.\s", text)
    if m:
        tok = f"RV§{m.group(1)}" if in_ruvector else f"§{m.group(1)}"
        if tok not in tokens and not sec_covered(tok):
            failures.append(h)
        continue
    # Named (unnumbered) ## sections → required token classes.
    named = {
        "Complete supplied capability register": ["INV09"],
        "Complete component integration table": ["DOC"],
        "Import, transformation, export, and release contract": ["REL"],
        "Anchor conformance ledger": ["A06", "A11"],
        "Review ledger": ["R01", "R05", "R07", "R09", "R11", "R14", "R16"],
        "FlexNetOS operating doctrine and release gate": ["DOC"],
        "Operational invariants and acceptance": ["INV04", "INV07", "INV12", "INV17"],
    }
    for name, req in named.items():
        if text.startswith(name):
            missing = [r for r in req if r not in tokens]
            if missing:
                failures.append(f"{h} -> missing tokens {missing}")
            break
    else:
        failures.append(f"UNMAPPED HEADING: {h}")

if failures:
    print("COVERAGE FAILURES:")
    print("\n".join(failures))
    sys.exit(1)
print(f"coverage OK: {len(headings)} real headings all mapped; {len(tokens)} section tokens in graph")
