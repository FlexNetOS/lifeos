#!/usr/bin/env python3
"""Validate the TEAS build task-graph and regenerate its CSV projection (VISION artifact E).

Dogfood: the TEAS build is itself expressed as handoff.task.v1 WorkOrders in
BUILD_TASK_GRAPH.json. This tool proves they are real:
  1. every WorkOrder validates against the canonical schemas/task_graph.schema.json;
  2. dependencies reference existing ids and form an acyclic DAG;
  3. it (re)writes BUILD_TASK_GRAPH.csv (the human control surface) from the JSON
     (the three-surface doctrine: CSV = human, JSON packet = agent, proof = reality).

Run:  python3 validate-build-task-graph.py   (exit 0 = valid; nonzero = defect)
Requires: jsonschema. Paths are derived from this file's location (relocatable).
"""
import json, csv, sys, pathlib
from jsonschema.validators import Draft202012Validator

HERE = pathlib.Path(__file__).resolve().parent
schema = json.load(open(HERE / "schemas" / "task_graph.schema.json"))
V = Draft202012Validator(schema)
wos = json.load(open(HERE / "BUILD_TASK_GRAPH.json"))
print(f"loaded {len(wos)} WorkOrders")

fail = 0
ids = {wo["id"] for wo in wos}
for wo in wos:
    errs = sorted(V.iter_errors(wo), key=lambda e: list(e.path))
    if errs:
        fail += 1
        print(f"  {wo.get('id','?')}: SCHEMA FAIL -> {[e.message for e in errs][:3]}")
print(f"schema validation: {len(wos)-fail}/{len(wos)} pass")

dangling = [(wo["id"], d) for wo in wos
            for d in wo.get("dependencies", []) + wo.get("blocked_by", []) if d not in ids]
print("dangling deps:", dangling if dangling else "none")

graph = {wo["id"]: set(wo.get("dependencies", [])) for wo in wos}
color = {n: 0 for n in graph}  # 0 white, 1 gray, 2 black
cycle = []
def dfs(n, stack):
    color[n] = 1
    for m in graph[n]:
        if color.get(m) == 1:
            cycle.append(stack + [n, m]); return True
        if color.get(m) == 0 and dfs(m, stack + [n]):
            return True
    color[n] = 2
    return False
has_cycle = any(dfs(n, []) for n in graph if color[n] == 0)
print("DAG check:", "CYCLE " + str(cycle) if has_cycle else "acyclic (valid DAG)")

# topological order for the human CSV view
order, tmp = [], {n: set(d) for n, d in graph.items()}
while tmp:
    ready = sorted(n for n, d in tmp.items() if not d)
    if not ready:
        break
    order += ready
    for n in ready:
        del tmp[n]
    for d in tmp.values():
        d -= set(ready)
print("topo order:", " -> ".join(order))

COLS = ["id", "phase", "title", "status", "priority", "owner_lane", "path_scope", "dependencies",
        "acceptance_criteria", "verification_command", "proof_required", "human_approval_required",
        "risk_level", "execution_cell", "rollback_plan"]
def cell(v):
    if isinstance(v, list): return "|".join(str(x) for x in v)
    if isinstance(v, bool): return "true" if v else "false"
    return "" if v is None else str(v)
with open(HERE / "BUILD_TASK_GRAPH.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(COLS)
    for wid in order:
        wo = next(x for x in wos if x["id"] == wid)
        w.writerow([cell(wo.get(c)) for c in COLS])
print(f"wrote {HERE / 'BUILD_TASK_GRAPH.csv'} ({len(wos)} rows, topo-ordered)")

sys.exit(1 if (fail or dangling or has_cycle) else 0)
