#!/usr/bin/env python3
"""Build bounded execution packets from the normalized task graph."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from reproducible_time import utc_now


NORMALIZED_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.normalized.v0"
PACKET_SCHEMA_VERSION = "lifeos-planning-spine.execution-packet.v0"
MANIFEST_SCHEMA_VERSION = "lifeos-planning-spine.execution-manifest.v0"
COVERAGE_CONTROL_SCHEMA_VERSION = "lifeos-planning-spine.coverage-control.v0"
COVERAGE_REPORT_SCHEMA_VERSION = "lifeos-planning-spine.coverage-gate-report.v0"
COMPLETE_COVERAGE_STATUSES = {"complete", "covered-complete"}
COMPLETE_DECOMPOSITION_STATUSES = {"complete", "decomposed", "task-families-complete"}
OWNER_APPROVAL_OPEN = "open"
MAX_OFFENDING_IN_REPORT = 25
REQUIRED_PACKET_FIELDS = [
    "packet_schema_version",
    "generated_at",
    "source_graph_uri",
    "task_id",
    "owner_agent",
    "paths",
    "cell",
    "verification_gate",
    "rollback_plan",
    "proof_uri",
]
PROSE_ONLY_FIELDS = {"goal", "next_action", "source_columns"}


class PacketError(Exception):
    pass


def load_normalized(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise PacketError(f"normalized task graph does not exist: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise PacketError(f"normalized task graph is not valid JSON: {error}")

    if data.get("schema_version") != NORMALIZED_SCHEMA_VERSION:
        raise PacketError(
            "normalized graph schema_version must be "
            f"{NORMALIZED_SCHEMA_VERSION!r}; got {data.get('schema_version')!r}"
        )
    tasks = data.get("tasks")
    if not isinstance(tasks, list):
        raise PacketError("normalized task graph is missing tasks array")
    return data


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_task_text(task: dict[str, Any], field: str) -> str:
    value = task.get(field)
    if not isinstance(value, str) or not value.strip():
        raise PacketError(f"task {task.get('task_id', '<unknown>')} missing required {field}")
    return value.strip()


def require_task_list(task: dict[str, Any], field: str) -> list[str]:
    value = task.get(field)
    if not isinstance(value, list) or not all(isinstance(item, str) and item.strip() for item in value):
        raise PacketError(f"task {task.get('task_id', '<unknown>')} missing required {field} list")
    return [item.strip() for item in value]


def build_packet(task: dict[str, Any], source_graph_uri: str, generated_at: str) -> dict[str, Any]:
    task_id = require_task_text(task, "task_id")
    packet = {
        "packet_schema_version": PACKET_SCHEMA_VERSION,
        "generated_at": generated_at,
        "source_graph_uri": source_graph_uri,
        "task_id": task_id,
        "title": require_task_text(task, "title"),
        "phase": require_task_text(task, "phase"),
        "owner_agent": require_task_text(task, "owner_agent"),
        "parent_ids": task.get("parent_ids", []),
        "source_row_number": task.get("source_row_number"),
        "paths": {
            "allowed": require_task_list(task, "allowed_paths"),
            "blocked": require_task_list(task, "blocked_paths"),
            "target_artifacts": require_task_list(task, "target_artifacts"),
        },
        "cell": require_task_text(task, "execution_cell"),
        "simulation_required": bool(task.get("simulation_required", False)),
        "verification_gate": require_task_text(task, "verification_gate"),
        "rollback_plan": require_task_text(task, "rollback_plan"),
        "proof_uri": require_task_text(task, "proof_uri"),
    }
    validate_packet(packet)
    return packet


def validate_packet(packet: dict[str, Any]) -> None:
    missing = [field for field in REQUIRED_PACKET_FIELDS if field not in packet]
    if missing:
        raise PacketError(f"packet {packet.get('task_id', '<unknown>')} missing fields: {', '.join(missing)}")
    leaked = sorted(PROSE_ONLY_FIELDS.intersection(packet.keys()))
    if leaked:
        raise PacketError(f"packet {packet['task_id']} includes prose-only field(s): {', '.join(leaked)}")
    paths = packet.get("paths")
    if not isinstance(paths, dict):
        raise PacketError(f"packet {packet['task_id']} paths must be an object")
    for field in ("allowed", "blocked", "target_artifacts"):
        value = paths.get(field)
        if not isinstance(value, list) or not value:
            raise PacketError(f"packet {packet['task_id']} paths.{field} must be a non-empty list")


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def rebuild_packets(
    normalized_path: Path,
    packet_dir: Path,
    manifest_path: Path,
    ready_status: str,
) -> dict[str, Any]:
    graph = load_normalized(normalized_path)
    generated_at = utc_now()
    source_graph_uri = str(normalized_path)
    tasks = [
        task
        for task in graph["tasks"]
        if str(task.get("status", "")).strip().lower() == ready_status
    ]

    packet_dir.mkdir(parents=True, exist_ok=True)
    for stale_packet in packet_dir.glob("*.json"):
        stale_packet.unlink()

    manifest_packets = []
    for task in tasks:
        packet = build_packet(task, source_graph_uri, generated_at)
        packet_path = packet_dir / f"{packet['task_id']}.json"
        write_json(packet_path, packet)
        manifest_packets.append(
            {
                "task_id": packet["task_id"],
                "path": str(packet_path),
                "packet_schema_version": PACKET_SCHEMA_VERSION,
                "source_row_number": packet["source_row_number"],
                "owner_agent": packet["owner_agent"],
                "cell": packet["cell"],
                "proof_uri": packet["proof_uri"],
                "sha256": sha256_file(packet_path),
            }
        )

    manifest = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "generated_at": generated_at,
        "source_graph_uri": source_graph_uri,
        "packet_schema_version": PACKET_SCHEMA_VERSION,
        "ready_status": ready_status,
        "packet_dir": str(packet_dir),
        "packet_count": len(manifest_packets),
        "task_ids": [packet["task_id"] for packet in manifest_packets],
        "packets": manifest_packets,
    }
    write_json(manifest_path, manifest)
    return manifest


def _cap(items: list[str]) -> list[str]:
    return sorted(items)[:MAX_OFFENDING_IN_REPORT]


def load_coverage_control(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise PacketError(f"coverage control does not exist: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise PacketError(f"coverage control is not valid JSON: {error}")
    if not isinstance(data, dict):
        raise PacketError("coverage control must be a JSON object")
    if data.get("schema_version") != COVERAGE_CONTROL_SCHEMA_VERSION:
        raise PacketError(
            "coverage control schema_version must be "
            f"{COVERAGE_CONTROL_SCHEMA_VERSION!r}; got {data.get('schema_version')!r}"
        )
    for key in ("anchors", "tasks", "phases"):
        if not isinstance(data.get(key), list):
            raise PacketError(f"coverage control missing required list: {key}")
    if not isinstance(data.get("owner_execution_approval"), str):
        raise PacketError("coverage control missing owner_execution_approval string")
    return data


def _detect_cycle(tasks: list[dict[str, Any]], task_ids: set[str]) -> list[str]:
    """Return the task_ids that participate in a dependency cycle (empty if acyclic)."""
    parents = {
        str(task.get("task_id", "")).strip(): [
            str(pid).strip()
            for pid in task.get("parent_ids", [])
            if str(pid).strip() in task_ids
        ]
        for task in tasks
    }
    WHITE, GREY, BLACK = 0, 1, 2
    color = {tid: WHITE for tid in parents}
    in_cycle: set[str] = set()

    def visit(node: str, stack: list[str]) -> None:
        color[node] = GREY
        stack.append(node)
        for parent in parents.get(node, []):
            if color.get(parent) == GREY:
                # back-edge: everything from parent..node is on the cycle
                idx = stack.index(parent)
                in_cycle.update(stack[idx:])
            elif color.get(parent) == WHITE:
                visit(parent, stack)
        stack.pop()
        color[node] = BLACK

    for tid in parents:
        if color[tid] == WHITE:
            visit(tid, [])
    return sorted(in_cycle)


def evaluate_coverage_gate(control: dict[str, Any]) -> dict[str, Any]:
    """Fail-closed North Star coverage gate. Returns a report with an overall result."""
    anchors = control["anchors"]
    tasks = control["tasks"]
    declared_phases = [str(p).strip() for p in control["phases"] if str(p).strip()]
    owner_approval = str(control["owner_execution_approval"]).strip().lower()

    task_ids = {str(t.get("task_id", "")).strip() for t in tasks if str(t.get("task_id", "")).strip()}

    # 1. incomplete-coverage
    incomplete_anchors = [
        str(a.get("anchor_id", "<unknown>"))
        for a in anchors
        if str(a.get("coverage_status", "")).strip().lower() not in COMPLETE_COVERAGE_STATUSES
        or str(a.get("decomposition_status", "")).strip().lower() not in COMPLETE_DECOMPOSITION_STATUSES
    ]

    # 2. missing-parents
    missing_parents = sorted(
        {
            f"{str(t.get('task_id'))}->{str(pid).strip()}"
            for t in tasks
            for pid in t.get("parent_ids", [])
            if str(pid).strip() and str(pid).strip() not in task_ids
        }
    )

    # 3. cycles
    cyclic_tasks = _detect_cycle(tasks, task_ids)

    # 4. orphan-phases: a declared phase with zero member tasks, or a task in an undeclared phase
    task_phases = {str(t.get("phase", "")).strip() for t in tasks if str(t.get("phase", "")).strip()}
    empty_phases = [p for p in declared_phases if p not in task_phases]
    undeclared_phases = sorted(task_phases - set(declared_phases))
    orphan_phases = sorted(set(empty_phases) | set(undeclared_phases))

    # 5. unanchored-tasks
    anchored = {
        str(tid).strip()
        for a in anchors
        for tid in a.get("phase_task_ids", [])
        if str(tid).strip()
    }
    unanchored_tasks = sorted(task_ids - anchored)

    # 6. closed-owner-approval
    owner_open = owner_approval == OWNER_APPROVAL_OPEN

    checks = [
        {
            "name": "coverage_complete",
            "result": "pass" if not incomplete_anchors else "fail",
            "detail": "every North Star anchor must be coverage- and decomposition-complete",
            "offending": _cap(incomplete_anchors),
        },
        {
            "name": "dependencies_resolve",
            "result": "pass" if not missing_parents else "fail",
            "detail": "every parent_id must reference a task in the graph",
            "offending": _cap(missing_parents),
        },
        {
            "name": "no_dependency_cycles",
            "result": "pass" if not cyclic_tasks else "fail",
            "detail": "the dependency graph must be acyclic",
            "offending": _cap(cyclic_tasks),
        },
        {
            "name": "phases_decomposed",
            "result": "pass" if not orphan_phases else "fail",
            "detail": "no declared phase may be empty and no task may sit in an undeclared phase",
            "offending": _cap(orphan_phases),
        },
        {
            "name": "tasks_anchored",
            "result": "pass" if not unanchored_tasks else "fail",
            "detail": "every task must be anchored to a North Star outcome",
            "offending": _cap(unanchored_tasks),
        },
        {
            "name": "owner_opened_execution",
            "result": "pass" if owner_open else "fail",
            "detail": "the owner must explicitly open execution",
            "offending": [] if owner_open else [owner_approval or "<unset>"],
        },
    ]

    failed = [c["name"] for c in checks if c["result"] == "fail"]
    return {
        "schema_version": COVERAGE_REPORT_SCHEMA_VERSION,
        "generated_at": utc_now(),
        "result": "pass" if not failed else "fail",
        "task_count": len(task_ids),
        "anchor_count": len(anchors),
        "owner_execution_approval": owner_approval,
        "failed_checks": failed,
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build bounded execution packet JSON files.")
    parser.add_argument(
        "normalized_json",
        type=Path,
        nargs="?",
        default=Path("generated/task_graph.normalized.json"),
        help="Normalized task graph JSON from normalize-task-graph.py",
    )
    parser.add_argument(
        "--packet-dir",
        type=Path,
        default=Path("generated/execution_packets"),
        help="Directory for per-task execution packets",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("generated/execution_manifest.json"),
        help="Execution packet manifest output path",
    )
    parser.add_argument(
        "--ready-status",
        default="ready",
        help="Normalized task status to package",
    )
    parser.add_argument(
        "--coverage-control",
        type=Path,
        default=None,
        help=(
            "Coverage-control JSON. When supplied, the fail-closed North Star coverage "
            "gate runs first and blocks packet generation unless it passes."
        ),
    )
    parser.add_argument(
        "--coverage-report",
        type=Path,
        default=Path("generated/north_star_coverage.report.json"),
        help="Coverage gate report output path (written whenever --coverage-control is given)",
    )
    args = parser.parse_args()

    if args.coverage_control is not None:
        try:
            control = load_coverage_control(args.coverage_control)
            report = evaluate_coverage_gate(control)
        except PacketError as error:
            print(f"build-execution-packets: error: {error}", file=sys.stderr)
            return 1
        write_json(args.coverage_report, report)
        if report["result"] != "pass":
            print(
                "build-execution-packets: coverage gate CLOSED — execution-packet "
                f"generation blocked; failed checks: {', '.join(report['failed_checks'])} "
                f"(report: {args.coverage_report})",
                file=sys.stderr,
            )
            return 1
        print(
            f"build-execution-packets: coverage gate OPEN (report: {args.coverage_report})"
        )

    try:
        manifest = rebuild_packets(
            args.normalized_json,
            args.packet_dir,
            args.manifest,
            args.ready_status.strip().lower(),
        )
    except PacketError as error:
        print(f"build-execution-packets: error: {error}", file=sys.stderr)
        return 1

    print(
        "build-execution-packets: wrote "
        f"{manifest['packet_count']} packet(s) to {args.packet_dir} "
        f"and manifest {args.manifest}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
