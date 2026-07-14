#!/usr/bin/env python3
"""Build the fail-closed North Star coverage control from canonical sources."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "lifeos-planning-spine.coverage-control.v0"
NORMALIZED_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.normalized.v0"
PACKAGE_ROOT = Path(__file__).resolve().parent.parent


class CoverageControlError(Exception):
    pass


def split_ids(value: str) -> list[str]:
    return [item.strip() for item in value.split(";") if item.strip()]


def source_uri(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(PACKAGE_ROOT).as_posix()
    except ValueError:
        return str(path)


def load_coverage_rows(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        raise CoverageControlError(f"coverage source does not exist: {path}")
    with path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise CoverageControlError(f"coverage source has no rows: {path}")
    required = {
        "anchor_id",
        "coverage_status",
        "decomposition_status",
        "phase_task_ids",
        "execution_gate",
    }
    missing = sorted(required - set(rows[0]))
    if missing:
        raise CoverageControlError(
            f"coverage source missing required column(s): {', '.join(missing)}"
        )
    return rows


def load_normalized_tasks(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise CoverageControlError(f"normalized graph does not exist: {path}")
    try:
        graph = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise CoverageControlError(f"normalized graph is not valid JSON: {error}") from error
    if graph.get("schema_version") != NORMALIZED_SCHEMA_VERSION:
        raise CoverageControlError(
            "normalized graph schema_version must be "
            f"{NORMALIZED_SCHEMA_VERSION!r}; got {graph.get('schema_version')!r}"
        )
    tasks = graph.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise CoverageControlError("normalized graph has no tasks")
    return tasks


def build_control(
    coverage_path: Path, normalized_path: Path
) -> dict[str, Any]:
    rows = load_coverage_rows(coverage_path)
    tasks = load_normalized_tasks(normalized_path)
    execution_gates = sorted(
        {row["execution_gate"].strip() for row in rows if row["execution_gate"].strip()}
    )
    owner_approval = (
        "open"
        if execution_gates and all(gate.lower() == "open" for gate in execution_gates)
        else "closed"
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "description": (
            "Real North Star coverage control derived from "
            "generated/north_star_coverage.source.csv + "
            "generated/task_graph.normalized.json. owner_execution_approval "
            "mirrors the CSV execution_gate column."
        ),
        "derived_from": {
            "coverage_csv": source_uri(coverage_path),
            "normalized_graph": source_uri(normalized_path),
            "csv_execution_gates": execution_gates,
        },
        "owner_execution_approval": owner_approval,
        "phases": sorted({str(task["phase"]).strip() for task in tasks}),
        "anchors": [
            {
                "anchor_id": row["anchor_id"].strip(),
                "coverage_status": row["coverage_status"].strip(),
                "decomposition_status": row["decomposition_status"].strip(),
                "phase_task_ids": split_ids(row["phase_task_ids"]),
            }
            for row in rows
        ],
        "tasks": [
            {
                "task_id": str(task["task_id"]).strip(),
                "phase": str(task["phase"]).strip(),
                "parent_ids": list(task.get("parent_ids", [])),
            }
            for task in tasks
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build the canonical fail-closed North Star coverage control."
    )
    parser.add_argument(
        "--coverage-source",
        type=Path,
        default=Path("generated/north_star_coverage.source.csv"),
    )
    parser.add_argument(
        "--normalized-graph",
        type=Path,
        default=Path("generated/task_graph.normalized.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("generated/north_star_coverage.control.json"),
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail if the checked-in control differs from the canonical sources.",
    )
    args = parser.parse_args()

    try:
        control = build_control(args.coverage_source, args.normalized_graph)
    except CoverageControlError as error:
        print(f"build-coverage-control: error: {error}", file=sys.stderr)
        return 1

    if args.check:
        if not args.output.is_file():
            print(
                f"build-coverage-control: stale: output does not exist: {args.output}",
                file=sys.stderr,
            )
            return 1
        try:
            existing = json.loads(args.output.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            print(
                f"build-coverage-control: stale: output is invalid JSON: {error}",
                file=sys.stderr,
            )
            return 1
        if existing != control:
            print(
                "build-coverage-control: stale: checked-in control differs from canonical sources",
                file=sys.stderr,
            )
            return 1
        print(f"build-coverage-control: current: {args.output}")
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(control, indent=2) + "\n", encoding="utf-8")
    print(
        f"build-coverage-control: wrote {args.output} with "
        f"{len(control['tasks'])} task(s) and {len(control['anchors'])} anchor(s)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
