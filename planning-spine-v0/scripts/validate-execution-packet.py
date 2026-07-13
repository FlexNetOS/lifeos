#!/usr/bin/env python3
"""Validate one bounded execution packet before an agent consumes it."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from reproducible_time import utc_now


PACKET_SCHEMA_VERSION = "lifeos-planning-spine.execution-packet.v0"
REPORT_SCHEMA_VERSION = "lifeos-planning-spine.execution-packet.validation-report.v0"
REQUIRED_TEXT_FIELDS = [
    "packet_schema_version",
    "generated_at",
    "source_graph_uri",
    "task_id",
    "owner_agent",
    "cell",
    "verification_gate",
    "rollback_plan",
    "proof_uri",
]
REQUIRED_PATH_LISTS = ["allowed", "blocked", "target_artifacts"]


@dataclass
class ValidationIssue:
    field: str
    message: str

    def to_json(self) -> dict[str, str]:
        return {"field": self.field, "message": self.message}


def load_packet(path: Path) -> tuple[dict[str, Any] | None, list[ValidationIssue]]:
    if not path.exists():
        return None, [ValidationIssue("packet_path", f"packet does not exist: {path}")]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return None, [ValidationIssue("packet_json", f"packet is not valid JSON: {error}")]
    if not isinstance(data, dict):
        return None, [ValidationIssue("packet_json", "packet must be a JSON object")]
    return data, []


def nonempty_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def nonempty_text_list(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(nonempty_text(item) for item in value)


def validate_packet(packet: dict[str, Any], expect_task_id: str | None = None) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    for field in REQUIRED_TEXT_FIELDS:
        if not nonempty_text(packet.get(field)):
            issues.append(ValidationIssue(field, f"{field} is required and must be non-empty text"))

    if packet.get("packet_schema_version") != PACKET_SCHEMA_VERSION:
        issues.append(
            ValidationIssue(
                "packet_schema_version",
                f"packet_schema_version must be {PACKET_SCHEMA_VERSION}",
            )
        )

    if expect_task_id and packet.get("task_id") != expect_task_id:
        issues.append(
            ValidationIssue("task_id", f"task_id must be {expect_task_id}; got {packet.get('task_id')!r}")
        )

    paths = packet.get("paths")
    if not isinstance(paths, dict):
        issues.append(ValidationIssue("paths", "paths object is required for packet scope"))
    else:
        for field in REQUIRED_PATH_LISTS:
            if not nonempty_text_list(paths.get(field)):
                issues.append(
                    ValidationIssue(
                        f"paths.{field}",
                        f"paths.{field} is required and must be a non-empty text list",
                    )
                )

    return issues


def build_report(
    packet_path: Path,
    packet: dict[str, Any] | None,
    issues: list[ValidationIssue],
) -> dict[str, Any]:
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "generated_at": utc_now(),
        "packet_path": str(packet_path),
        "task_id": packet.get("task_id") if packet else None,
        "result": "pass" if not issues else "fail",
        "error_count": len(issues),
        "errors": [issue.to_json() for issue in issues],
        "observed": {
            "packet_schema_version": packet.get("packet_schema_version") if packet else None,
            "has_owner": nonempty_text(packet.get("owner_agent")) if packet else False,
            "has_cell": nonempty_text(packet.get("cell")) if packet else False,
            "has_scope": isinstance(packet.get("paths"), dict) if packet else False,
            "has_verification": nonempty_text(packet.get("verification_gate")) if packet else False,
            "has_rollback": nonempty_text(packet.get("rollback_plan")) if packet else False,
            "has_proof": nonempty_text(packet.get("proof_uri")) if packet else False,
        },
    }


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate one execution packet JSON file.")
    parser.add_argument("packet_json", type=Path, help="Execution packet JSON file to validate")
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("generated/execution_packet.validation_report.json"),
        help="Validation report JSON output path",
    )
    parser.add_argument(
        "--expect-task-id",
        help="Optional task_id expected in the packet",
    )
    args = parser.parse_args()

    packet, load_issues = load_packet(args.packet_json)
    issues = load_issues
    if packet is not None:
        issues.extend(validate_packet(packet, args.expect_task_id))

    report = build_report(args.packet_json, packet, issues)
    write_json(args.report, report)

    if issues:
        print(
            "validate-execution-packet: validation failed with "
            f"{len(issues)} error(s); see {args.report}",
            file=sys.stderr,
        )
        return 1

    print(
        "validate-execution-packet: "
        f"{args.packet_json} passed; report {args.report}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
