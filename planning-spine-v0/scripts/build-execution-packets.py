#!/usr/bin/env python3
"""Build bounded execution packets from the normalized task graph."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


NORMALIZED_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.normalized.v0"
PACKET_SCHEMA_VERSION = "lifeos-planning-spine.execution-packet.v0"
MANIFEST_SCHEMA_VERSION = "lifeos-planning-spine.execution-manifest.v0"
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


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


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
    if not tasks:
        raise PacketError(f"normalized graph has no tasks with status {ready_status!r}")

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
    args = parser.parse_args()

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
