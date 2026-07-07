#!/usr/bin/env python3
"""Project task graph status from the append-only proof ledger."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


NORMALIZED_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.normalized.v0"
STATUS_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.status.v0"
LEDGER_SCHEMA_VERSION = "lifeos-planning-spine.proof-ledger.v0"
ALLOWED_UPDATED_FIELDS = {"status", "proof_uri", "next_action"}
PASSING_PROOF_STATUSES = {"complete", "pass", "passed"}


class StatusError(Exception):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise StatusError(f"JSON input does not exist: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise StatusError(f"{path}: invalid JSON: {error}") from error
    if not isinstance(data, dict):
        raise StatusError(f"{path}: expected a JSON object")
    return data


def load_normalized_graph(path: Path) -> dict[str, Any]:
    data = load_json(path)
    if data.get("schema_version") != NORMALIZED_SCHEMA_VERSION:
        raise StatusError(
            f"{path}: schema_version must be {NORMALIZED_SCHEMA_VERSION!r}; "
            f"got {data.get('schema_version')!r}"
        )
    tasks = data.get("tasks")
    if not isinstance(tasks, list) or not all(isinstance(task, dict) for task in tasks):
        raise StatusError(f"{path}: tasks must be an array of objects")
    return data


def revision_rank(raw: Any) -> tuple[int, str]:
    if isinstance(raw, int):
        return raw, str(raw)
    if isinstance(raw, str) and raw.strip():
        text = raw.strip()
        if text.isdigit():
            return int(text), text
        return -1, text
    return -1, ""


def ledger_sort_key(entry: dict[str, Any], line_number: int) -> tuple[int, str, int]:
    sequence = entry.get("sequence")
    if not isinstance(sequence, int):
        sequence = line_number
    rank, revision = revision_rank(entry.get("revision"))
    return sequence, revision, rank


def load_latest_ledger(path: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    if not path.exists():
        raise StatusError(f"proof ledger does not exist: {path}")

    entries: list[dict[str, Any]] = []
    latest: dict[str, dict[str, Any]] = {}
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as error:
            raise StatusError(f"{path}:{line_number}: invalid JSONL: {error}") from error
        if not isinstance(entry, dict):
            raise StatusError(f"{path}:{line_number}: ledger line must be a JSON object")
        if entry.get("schema_version") != LEDGER_SCHEMA_VERSION:
            raise StatusError(
                f"{path}:{line_number}: schema_version must be {LEDGER_SCHEMA_VERSION!r}; "
                f"got {entry.get('schema_version')!r}"
            )
        task_id = entry.get("task_id")
        if not isinstance(task_id, str) or not task_id.strip():
            raise StatusError(f"{path}:{line_number}: task_id is required")
        proof_uri = entry.get("proof_uri")
        if not isinstance(proof_uri, str) or not proof_uri.strip():
            raise StatusError(f"{path}:{line_number}: proof_uri is required")
        entry["_line_number"] = line_number
        entries.append(entry)

        current = latest.get(task_id.strip())
        if current is None or ledger_sort_key(entry, line_number) > ledger_sort_key(
            current,
            int(current.get("_line_number", 0)),
        ):
            latest[task_id.strip()] = entry

    if not entries:
        raise StatusError(f"proof ledger has no entries: {path}")
    return entries, latest


def child_index(tasks: list[dict[str, Any]]) -> dict[str, list[str]]:
    children: dict[str, list[str]] = {}
    for task in tasks:
        task_id = str(task.get("task_id", "")).strip()
        for parent_id in task.get("parent_ids", []):
            if isinstance(parent_id, str) and parent_id.strip():
                children.setdefault(parent_id.strip(), []).append(task_id)
    return children


def passing_status(status: Any) -> bool:
    return isinstance(status, str) and status.strip().lower() in PASSING_PROOF_STATUSES


def next_action_for(task_id: str, ledger_entry: dict[str, Any], children: dict[str, list[str]]) -> str:
    proof_uri = str(ledger_entry.get("proof_uri", "")).strip()
    child_ids = children.get(task_id, [])
    if child_ids:
        return f"Proof accepted from {proof_uri}; next child task: {child_ids[0]}."
    return f"Proof accepted from {proof_uri}; no child task is declared in this graph."


def status_projection(graph_path: Path, ledger_path: Path) -> dict[str, Any]:
    graph = load_normalized_graph(graph_path)
    ledger_entries, latest_by_task = load_latest_ledger(ledger_path)
    tasks: list[dict[str, Any]] = graph["tasks"]
    children = child_index(tasks)
    generated_at = utc_now()

    status_tasks: list[dict[str, Any]] = []
    forbidden_updates: list[dict[str, Any]] = []
    updated_task_ids: list[str] = []
    complete_task_ids: list[str] = []
    ready_task_ids: list[str] = []

    for task in tasks:
        task_id = str(task.get("task_id", "")).strip()
        if not task_id:
            raise StatusError("normalized task missing task_id")

        source_status = str(task.get("status", "")).strip() or "unknown"
        source_proof_uri = str(task.get("proof_uri", "")).strip()
        source_next_action = str(task.get("next_action", "")).strip()

        ledger_entry = latest_by_task.get(task_id)
        effective_status = source_status
        effective_proof_uri = source_proof_uri
        effective_next_action = source_next_action
        proof_observed_at = None
        proof_sha256 = None
        proof_revision = None

        if ledger_entry is not None:
            proof_observed_at = ledger_entry.get("observed_at")
            proof_sha256 = ledger_entry.get("proof_sha256")
            proof_revision = ledger_entry.get("revision")
            effective_proof_uri = str(ledger_entry.get("proof_uri", source_proof_uri)).strip()
            if passing_status(ledger_entry.get("status")):
                effective_status = "complete"
                effective_next_action = next_action_for(task_id, ledger_entry, children)

        changes: dict[str, dict[str, Any]] = {}
        for field, source, effective in (
            ("status", source_status, effective_status),
            ("proof_uri", source_proof_uri, effective_proof_uri),
            ("next_action", source_next_action, effective_next_action),
        ):
            if source != effective:
                changes[field] = {"from": source, "to": effective}

        for field in changes:
            if field not in ALLOWED_UPDATED_FIELDS:
                forbidden_updates.append({"task_id": task_id, "field": field})

        if changes:
            updated_task_ids.append(task_id)
        if effective_status == "complete":
            complete_task_ids.append(task_id)
        else:
            ready_task_ids.append(task_id)

        status_tasks.append(
            {
                "task_id": task_id,
                "source_row_number": task.get("source_row_number"),
                "title": task.get("title", ""),
                "phase": task.get("phase", ""),
                "parent_ids": task.get("parent_ids", []),
                "source": {
                    "status": source_status,
                    "proof_uri": source_proof_uri,
                    "next_action": source_next_action,
                },
                "effective": {
                    "status": effective_status,
                    "proof_uri": effective_proof_uri,
                    "next_action": effective_next_action,
                },
                "proof": {
                    "ledger_line_number": ledger_entry.get("_line_number") if ledger_entry else None,
                    "observed_at": proof_observed_at,
                    "revision": proof_revision,
                    "sha256": proof_sha256,
                },
                "updated_fields": sorted(changes),
                "updates": changes,
            }
        )

    status = {
        "schema_version": STATUS_SCHEMA_VERSION,
        "generated_at": generated_at,
        "source_graph_uri": str(graph_path),
        "source_graph_sha256": sha256_file(graph_path),
        "proof_ledger_uri": str(ledger_path),
        "proof_ledger_sha256": sha256_file(ledger_path),
        "update_policy": {
            "allowed_updated_fields": sorted(ALLOWED_UPDATED_FIELDS),
            "mutates_source_graph": False,
            "mutates_sheet": False,
        },
        "result": "pass" if not forbidden_updates else "fail",
        "task_count": len(tasks),
        "ledger_entry_count": len(ledger_entries),
        "updated_task_ids": updated_task_ids,
        "complete_task_ids": complete_task_ids,
        "ready_task_ids": ready_task_ids,
        "next_ready_task_id": ready_task_ids[0] if ready_task_ids else None,
        "forbidden_update_count": len(forbidden_updates),
        "forbidden_updates": forbidden_updates,
        "tasks": status_tasks,
    }
    return status


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Project task status from a normalized graph and proof ledger.")
    parser.add_argument(
        "normalized_json",
        type=Path,
        nargs="?",
        default=Path("generated/task_graph.normalized.json"),
        help="Normalized task graph JSON",
    )
    parser.add_argument(
        "--ledger",
        type=Path,
        default=Path("proof_records/proof_ledger.jsonl"),
        help="Append-only proof ledger JSONL",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("generated/task_graph.status.json"),
        help="Generated status projection JSON",
    )
    args = parser.parse_args()

    try:
        status = status_projection(args.normalized_json, args.ledger)
    except StatusError as error:
        print(f"update-task-graph-status: error: {error}", file=sys.stderr)
        return 1

    write_json(args.output, status)
    print(
        "update-task-graph-status: wrote "
        f"{status['task_count']} task status entrie(s), "
        f"{len(status['updated_task_ids'])} task(s) updated, "
        f"next_ready_task_id={status['next_ready_task_id']}"
    )
    return 0 if status["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
