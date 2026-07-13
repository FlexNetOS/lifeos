#!/usr/bin/env python3
"""Normalize raw task graph rows into typed JSON artifacts.

The extractor preserves source text. This stage validates the task graph
contract, coerces simple field types, and builds indexes for later packet
generation without mutating the source CSV or Sheet.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from reproducible_time import utc_now


RAW_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.raw.v0"
NORMALIZED_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.normalized.v0"
INDEX_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.index.v0"
REPORT_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.normalize-report.v0"

REQUIRED_COLUMNS = [
    "task_id",
    "parent_id",
    "phase",
    "title",
    "owner_agent",
    "goal",
    "inputs",
    "target_artifacts",
    "allowed_paths",
    "blocked_paths",
    "simulation_required",
    "execution_cell",
    "verification_gate",
    "rollback_plan",
    "status",
    "proof_uri",
    "next_action",
]

REQUIRED_NONEMPTY_COLUMNS = [
    "task_id",
    "allowed_paths",
    "blocked_paths",
    "verification_gate",
    "rollback_plan",
    "proof_uri",
    "execution_cell",
]

LIST_COLUMNS = {
    "parent_id": "parent_ids",
    "inputs": "inputs",
    "target_artifacts": "target_artifacts",
    "allowed_paths": "allowed_paths",
    "blocked_paths": "blocked_paths",
}

TASK_ID_PATTERN = re.compile(r"^[A-Z][A-Z0-9]*-[0-9]{3}$")
TRUE_VALUES = {"true", "yes", "y", "1"}
FALSE_VALUES = {"false", "no", "n", "0"}


@dataclass
class ValidationIssue:
    message: str
    source_row_number: int | None = None
    task_id: str | None = None
    field: str | None = None

    def to_json(self) -> dict[str, Any]:
        result: dict[str, Any] = {"message": self.message}
        if self.source_row_number is not None:
            result["source_row_number"] = self.source_row_number
        if self.task_id is not None:
            result["task_id"] = self.task_id
        if self.field is not None:
            result["field"] = self.field
        return result


class ValidationError(Exception):
    def __init__(self, issue: ValidationIssue):
        super().__init__(issue.message)
        self.issue = issue


def load_raw(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ValidationError(ValidationIssue(f"raw task graph does not exist: {path}"))
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValidationError(ValidationIssue(f"raw task graph is not valid JSON: {error}"))

    if data.get("schema_version") != RAW_SCHEMA_VERSION:
        raise ValidationError(
            ValidationIssue(
                "raw task graph schema_version must be "
                f"{RAW_SCHEMA_VERSION!r}; got {data.get('schema_version')!r}"
            )
        )

    rows = data.get("rows")
    if not isinstance(rows, list) or not rows:
        raise ValidationError(ValidationIssue("raw task graph has no rows"))

    header = data.get("source", {}).get("header")
    if not isinstance(header, list):
        raise ValidationError(ValidationIssue("raw task graph is missing source.header"))

    if header != REQUIRED_COLUMNS:
        missing = [column for column in REQUIRED_COLUMNS if column not in header]
        extra = [column for column in header if column not in REQUIRED_COLUMNS]
        detail = []
        if missing:
            detail.append(f"missing: {', '.join(missing)}")
        if extra:
            detail.append(f"extra: {', '.join(extra)}")
        if not detail:
            detail.append("column order differs")
        raise ValidationError(
            ValidationIssue("raw task graph header does not match Task Graph v0: " + "; ".join(detail))
        )

    return data


def split_list(value: str) -> list[str]:
    value = value.strip()
    if not value:
        return []
    parts = []
    for semicolon_part in value.split(";"):
        for comma_part in semicolon_part.split(","):
            item = comma_part.strip()
            if item:
                parts.append(item)
    return parts


def normalize_status(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return normalized or "unknown"


def parse_bool(value: str, field_name: str, task_id: str, source_row_number: int) -> bool:
    normalized = value.strip().lower()
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    raise ValidationError(
        ValidationIssue(
            f"{field_name} must be a boolean value; got {value!r}",
            source_row_number=source_row_number,
            task_id=task_id,
            field=field_name,
        )
    )


def require_text(columns: dict[str, str], column: str, task_id: str, source_row_number: int) -> str:
    value = columns.get(column, "")
    if not isinstance(value, str):
        raise ValidationError(
            ValidationIssue(
                f"{column} must be text",
                source_row_number=source_row_number,
                task_id=task_id,
                field=column,
            )
        )
    value = value.strip()
    if not value:
        raise ValidationError(
            ValidationIssue(
                f"{column} is required for LPS-013 normalization",
                source_row_number=source_row_number,
                task_id=task_id,
                field=column,
            )
        )
    return value


def normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    source_row_number = row.get("source_row_number")
    if not isinstance(source_row_number, int):
        raise ValidationError(ValidationIssue("raw row missing integer source_row_number"))

    columns = row.get("columns")
    if not isinstance(columns, dict):
        raise ValidationError(ValidationIssue("raw row missing columns object", source_row_number))

    string_columns: dict[str, str] = {}
    for column in REQUIRED_COLUMNS:
        value = columns.get(column)
        if value is None:
            raise ValidationError(
                ValidationIssue(
                    f"missing required column {column}",
                    source_row_number=source_row_number,
                    field=column,
                )
            )
        if not isinstance(value, str):
            raise ValidationError(
                ValidationIssue(
                    f"{column} must be text",
                    source_row_number=source_row_number,
                    field=column,
                )
            )
        string_columns[column] = value

    task_id = require_text(string_columns, "task_id", "unknown", source_row_number)
    if not TASK_ID_PATTERN.match(task_id):
        raise ValidationError(
            ValidationIssue(
                f"task_id {task_id!r} does not match PREFIX-000",
                source_row_number=source_row_number,
                task_id=task_id,
                field="task_id",
            )
        )

    for column in REQUIRED_NONEMPTY_COLUMNS:
        require_text(string_columns, column, task_id, source_row_number)

    normalized: dict[str, Any] = {
        "task_id": task_id,
        "source_row_number": source_row_number,
        "phase": string_columns["phase"].strip(),
        "title": string_columns["title"].strip(),
        "owner_agent": string_columns["owner_agent"].strip(),
        "goal": string_columns["goal"].strip(),
        "simulation_required": parse_bool(
            string_columns["simulation_required"],
            "simulation_required",
            task_id,
            source_row_number,
        ),
        "execution_cell": string_columns["execution_cell"].strip(),
        "verification_gate": string_columns["verification_gate"].strip(),
        "rollback_plan": string_columns["rollback_plan"].strip(),
        "status": normalize_status(string_columns["status"]),
        "proof_uri": string_columns["proof_uri"].strip(),
        "next_action": string_columns["next_action"].strip(),
        "source_columns": string_columns,
    }

    for source_column, output_column in LIST_COLUMNS.items():
        normalized[output_column] = split_list(string_columns[source_column])

    return normalized


def build_index(tasks: list[dict[str, Any]], generated_at: str, raw_path: Path) -> dict[str, Any]:
    by_task_id: dict[str, dict[str, Any]] = {}
    children_by_parent: dict[str, list[str]] = {}
    tasks_by_status: dict[str, list[str]] = {}
    tasks_by_phase: dict[str, list[str]] = {}
    proof_uri_by_task: dict[str, str] = {}

    for index, task in enumerate(tasks):
        task_id = task["task_id"]
        if task_id in by_task_id:
            raise ValidationError(ValidationIssue(f"duplicate task_id: {task_id}", task_id=task_id))

        by_task_id[task_id] = {
            "index": index,
            "source_row_number": task["source_row_number"],
            "phase": task["phase"],
            "status": task["status"],
            "parent_ids": task["parent_ids"],
            "proof_uri": task["proof_uri"],
            "execution_cell": task["execution_cell"],
        }
        proof_uri_by_task[task_id] = task["proof_uri"]

        tasks_by_status.setdefault(task["status"], []).append(task_id)
        tasks_by_phase.setdefault(task["phase"], []).append(task_id)

        for parent_id in task["parent_ids"]:
            if not TASK_ID_PATTERN.match(parent_id):
                raise ValidationError(
                    ValidationIssue(
                        f"parent_id {parent_id!r} does not match PREFIX-000",
                        source_row_number=task["source_row_number"],
                        task_id=task_id,
                        field="parent_id",
                    )
                )
            children_by_parent.setdefault(parent_id, []).append(task_id)

    missing_parent_ids = sorted(
        {
            parent_id
            for task in tasks
            for parent_id in task["parent_ids"]
            if parent_id not in by_task_id
        }
    )

    return {
        "schema_version": INDEX_SCHEMA_VERSION,
        "generated_at": generated_at,
        "source_graph_uri": str(raw_path),
        "task_count": len(tasks),
        "task_ids": [task["task_id"] for task in tasks],
        "ready_task_ids": tasks_by_status.get("ready", []),
        "complete_task_ids": tasks_by_status.get("complete", []),
        "by_task_id": by_task_id,
        "tasks_by_id": by_task_id,
        "tasks_by_status": tasks_by_status,
        "tasks_by_phase": tasks_by_phase,
        "children_by_parent": children_by_parent,
        "proof_uri_by_task": proof_uri_by_task,
        "missing_parent_ids": missing_parent_ids,
    }


def normalize(raw_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    raw = load_raw(raw_path)
    generated_at = utc_now()
    tasks = [normalize_row(row) for row in raw["rows"]]
    index = build_index(tasks, generated_at, raw_path)

    normalized = {
        "schema_version": NORMALIZED_SCHEMA_VERSION,
        "generated_at": generated_at,
        "source_graph_uri": str(raw_path),
        "task_count": len(tasks),
        "source": {
            "schema_version": raw["schema_version"],
            "generated_at": raw.get("generated_at"),
            "format": raw.get("source", {}).get("format"),
            "path": raw.get("source", {}).get("path"),
            "row_count": raw.get("source", {}).get("row_count"),
            "empty_rows_skipped": raw.get("source", {}).get("empty_rows_skipped", []),
            "required_columns": REQUIRED_COLUMNS,
        },
        "tasks": tasks,
    }

    return normalized, index


def make_report(
    raw_path: Path,
    generated_at: str,
    result: str,
    task_count: int,
    issues: list[ValidationIssue],
) -> dict[str, Any]:
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "generated_at": generated_at,
        "source_graph_uri": str(raw_path),
        "result": result,
        "task_count": task_count,
        "error_count": len(issues),
        "errors": [issue.to_json() for issue in issues],
    }


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Normalize extracted task graph JSON and build task indexes."
    )
    parser.add_argument(
        "raw_json",
        type=Path,
        nargs="?",
        default=Path("generated/task_graph.raw.json"),
        help="Raw task graph JSON from extract-task-graph.py",
    )
    parser.add_argument(
        "-o",
        "--output",
        "--normalized-output",
        dest="normalized_output",
        type=Path,
        default=Path("generated/task_graph.normalized.json"),
        help="Normalized task graph JSON output path",
    )
    parser.add_argument(
        "--index",
        "--index-output",
        dest="index_output",
        type=Path,
        default=Path("generated/task_graph.index.json"),
        help="Task graph index JSON output path",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("generated/task_graph.normalize_report.json"),
        help="Normalization report JSON output path",
    )
    args = parser.parse_args()

    report_generated_at = utc_now()
    try:
        normalized, index = normalize(args.raw_json)
    except ValidationError as error:
        report = make_report(args.raw_json, report_generated_at, "fail", 0, [error.issue])
        write_json(args.report, report)
        print(
            "normalize-task-graph: validation failed with "
            f"{report['error_count']} error(s); see {args.report}",
            file=sys.stderr,
        )
        return 1

    report = make_report(args.raw_json, normalized["generated_at"], "pass", len(normalized["tasks"]), [])
    write_json(args.normalized_output, normalized)
    write_json(args.index_output, index)
    write_json(args.report, report)

    print(
        "normalize-task-graph: wrote "
        f"{args.normalized_output} and {args.index_output} "
        f"with {len(normalized['tasks'])} task(s)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
