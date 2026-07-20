#!/usr/bin/env python3
"""Project task graph status from the append-only proof ledger."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

from reproducible_time import utc_now


NORMALIZED_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.normalized.v0"
STATUS_SCHEMA_VERSION = "lifeos-planning-spine.task-graph.status.v0"
LEDGER_SCHEMA_VERSION = "lifeos-planning-spine.proof-ledger.v0"
ALLOWED_UPDATED_FIELDS = {"status", "proof_uri", "next_action"}
PASSING_PROOF_STATUSES = {"complete", "pass", "passed"}
ROLLBACK_LEDGER_STATUSES = {"fail", "failed", "rolled-back", "rolled_back", "rollback", "reject", "rejected"}
INVALIDATING_PROOF_STATUSES = {"invalidated"}
RESOLUTION_STATUS = "conflict-resolved"
ACCEPTED_DISPOSITION = "accepted"
SUPERSEDED_DISPOSITION = "superseded"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
# Canonical lifecycle states, ordered from non-executable to terminal.
LIFECYCLE_STATES = ("draft", "blocked", "ready", "simulated", "running", "complete", "rolled-back")
# Only a genuinely ready task is executable; draft/blocked/running/rolled-back are not.
EXECUTABLE_LIFECYCLE = "ready"
SOURCE_STATUS_LIFECYCLE = {
    "draft": "draft",
    "blocked": "blocked",
    "ready": "ready",
    "simulated": "simulated",
    "running": "running",
    "complete": "complete",
    "completed": "complete",
    "done": "complete",
    "pass": "complete",
    "passed": "complete",
    "rolled-back": "rolled-back",
    "rolled_back": "rolled-back",
    "rollback": "rolled-back",
}


class StatusError(Exception):
    pass


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


def validate_resolution_record(
    entry: dict[str, Any], key: tuple[str, str], prior_identities: list[dict[str, Any]]
) -> str | None:
    """Return a problem description when a conflict-resolved record is invalid.

    Mirrors merge-proof-records.py so every ledger reader applies the identical
    resolution contract.
    """
    resolves = entry.get("resolves")
    if not isinstance(resolves, dict):
        return "a resolves object naming every conflicting identity is required"
    if resolves.get("task_id") != key[0] or str(resolves.get("revision", "")).strip() != key[1]:
        return "resolves.task_id/revision must match the record task_id/revision"
    identities = resolves.get("identities")
    if not isinstance(identities, list) or len(identities) < 2:
        return "resolves.identities must name at least two ledger identities"
    named: list[tuple[int, str]] = []
    accepted: list[tuple[int, str]] = []
    for item in identities:
        if not isinstance(item, dict):
            return "each resolves identity must be an object"
        sequence = item.get("sequence")
        digest = item.get("proof_sha256")
        disposition = item.get("disposition")
        if not isinstance(sequence, int):
            return "each resolves identity requires an integer sequence"
        if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest.strip().lower()):
            return "each resolves identity requires a 64-character proof_sha256"
        if disposition not in (ACCEPTED_DISPOSITION, SUPERSEDED_DISPOSITION):
            return "each resolves identity disposition must be accepted or superseded"
        named.append((sequence, digest.strip().lower()))
        if disposition == ACCEPTED_DISPOSITION:
            accepted.append((sequence, digest.strip().lower()))
    if len(accepted) != 1:
        return "exactly one resolves identity must carry the accepted disposition"
    actual = {(line["sequence"], line["proof_sha256"]) for line in prior_identities}
    if set(named) != actual or len(named) != len(set(named)):
        return "resolves.identities must exactly match the ledger's recorded identities"
    if len({digest for _, digest in actual}) < 2:
        return "the named identities carry no digest conflict to resolve"
    accepted_sequence, accepted_digest = accepted[0]
    if resolves.get("accepted_sequence") != accepted_sequence:
        return "resolves.accepted_sequence must match the accepted identity"
    if resolves.get("accepted_proof_sha256") != accepted_digest:
        return "resolves.accepted_proof_sha256 must match the accepted identity"
    if entry.get("proof_sha256") != accepted_digest:
        return "record proof_sha256 must equal the accepted digest"
    accepted_line = next(line for line in prior_identities if line["sequence"] == accepted_sequence)
    if entry.get("proof_uri") != accepted_line["proof_uri"]:
        return "record proof_uri must equal the accepted identity's proof_uri"
    for field in ("verified_by", "verified_at", "resolution_reason"):
        value = entry.get(field)
        if not isinstance(value, str) or not value.strip():
            return f"an independent-verifier {field} is required"
    return None


def ledger_conflict_exclusions(path: Path, entries: list[dict[str, Any]]) -> set[int]:
    """Fail closed on duplicate task/revision digest conflicts; return excluded lines.

    A conflict is acceptable only when a later conflict-resolved record names every
    recorded identity and accepts exactly one. The returned line numbers (resolution
    records plus superseded identities) never participate in latest-proof selection,
    so every reader projects the single accepted identity.
    """
    proof_lines: dict[tuple[str, str], list[dict[str, Any]]] = {}
    acceptance: dict[tuple[str, str], dict[str, Any]] = {}
    resolution_line_numbers: list[int] = []
    errors: list[str] = []
    for entry in entries:
        line_number = int(entry["_line_number"])
        task_id = str(entry.get("task_id", "")).strip()
        revision = entry.get("revision")
        if revision is None:
            revision = entry.get("observed_at")
        revision = str(revision).strip() if revision is not None else ""
        key = (task_id, revision)
        sequence = entry.get("sequence")
        if not isinstance(sequence, int):
            sequence = line_number
        status = str(entry.get("status", "")).strip().lower()
        if status == RESOLUTION_STATUS:
            resolution_line_numbers.append(line_number)
            problem = validate_resolution_record(entry, key, proof_lines.get(key, []))
            if problem is not None:
                errors.append(
                    f"{path}:{line_number}: invalid conflict-resolution record for "
                    f"{key[0]} revision {key[1]}: {problem}"
                )
                continue
            acceptance[key] = {
                "sequence": sequence,
                "accepted_sequence": entry["resolves"]["accepted_sequence"],
                "accepted_proof_sha256": entry["resolves"]["accepted_proof_sha256"],
            }
            continue
        if "resolves" in entry:
            errors.append(
                f"{path}:{line_number}: only conflict-resolved records may carry a resolves object"
            )
            continue
        digest = str(entry.get("proof_sha256", entry.get("source_sha256", ""))).strip()
        proof_lines.setdefault(key, []).append(
            {
                "sequence": sequence,
                "proof_sha256": digest,
                "proof_uri": str(entry.get("proof_uri", "")).strip(),
                "line_number": line_number,
            }
        )

    excluded = set(resolution_line_numbers)
    unresolved: list[str] = []
    for key in sorted(proof_lines):
        lines = proof_lines[key]
        accepted = acceptance.get(key)
        identity_text = ", ".join(
            f"sequence {line['sequence']} digest {line['proof_sha256']}" for line in lines
        )
        if accepted is not None:
            diverged = [
                line
                for line in lines
                if line["sequence"] > accepted["sequence"]
                and line["proof_sha256"] != accepted["accepted_proof_sha256"]
            ]
            if diverged:
                unresolved.append(f"{key[0]} revision {key[1]} ({identity_text})")
                continue
            excluded.update(
                line["line_number"]
                for line in lines
                if line["sequence"] != accepted["accepted_sequence"]
            )
            continue
        if len({line["proof_sha256"] for line in lines}) > 1:
            unresolved.append(f"{key[0]} revision {key[1]} ({identity_text})")

    if errors:
        raise StatusError("; ".join(errors))
    if unresolved:
        raise StatusError(
            "unresolved proof-ledger conflict(s): "
            + "; ".join(unresolved)
            + " — append an independent-verifier conflict-resolved record naming every identity"
        )
    return excluded


def load_latest_ledger(path: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    if not path.exists():
        raise StatusError(f"proof ledger does not exist: {path}")

    entries: list[dict[str, Any]] = []
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

    if not entries:
        raise StatusError(f"proof ledger has no entries: {path}")

    excluded_lines = ledger_conflict_exclusions(path, entries)
    latest: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if int(entry["_line_number"]) in excluded_lines:
            continue
        task_id = str(entry["task_id"]).strip()
        current = latest.get(task_id)
        if current is None or ledger_sort_key(entry, int(entry["_line_number"])) > ledger_sort_key(
            current,
            int(current.get("_line_number", 0)),
        ):
            latest[task_id] = entry
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


def lifecycle_state(source_status: str, ledger_entry: dict[str, Any] | None) -> str:
    """Project a task's canonical lifecycle state from its source status and latest proof.

    Proof is authoritative: a passing ledger entry projects Complete; a failing or
    rolled-back ledger entry reopens the task as rolled-back (08_EXECUTION_GATES rule 5).
    Absent a ledger entry, the source status governs. A task is executable-ready only
    when it projects exactly ``ready``.
    """
    if ledger_entry is not None:
        ledger_status = str(ledger_entry.get("status", "")).strip().lower()
        if ledger_status in PASSING_PROOF_STATUSES:
            return "complete"
        if ledger_status in ROLLBACK_LEDGER_STATUSES:
            return "rolled-back"
    normalized = str(source_status).strip().lower()
    return SOURCE_STATUS_LIFECYCLE.get(normalized, normalized or "unknown")


def next_action_for(task_id: str, ledger_entry: dict[str, Any], children: dict[str, list[str]]) -> str:
    proof_uri = str(ledger_entry.get("proof_uri", "")).strip()
    child_ids = children.get(task_id, [])
    if child_ids:
        return f"Proof accepted from {proof_uri}; next child task: {child_ids[0]}."
    return f"Proof accepted from {proof_uri}; no child task is declared in this graph."


def status_projection(
    graph_path: Path,
    ledger_path: Path,
    global_coverage_gate: str = "closed",
) -> dict[str, Any]:
    graph = load_normalized_graph(graph_path)
    ledger_entries, latest_by_task = load_latest_ledger(ledger_path)
    tasks: list[dict[str, Any]] = graph["tasks"]
    children = child_index(tasks)
    generated_at = utc_now()
    coverage_gate = str(global_coverage_gate).strip().lower()
    coverage_gate_open = coverage_gate == "open"

    status_tasks: list[dict[str, Any]] = []
    forbidden_updates: list[dict[str, Any]] = []
    updated_task_ids: list[str] = []
    complete_task_ids: list[str] = []
    ready_task_ids: list[str] = []
    invalidated_task_ids: list[str] = []
    lifecycle_buckets: dict[str, list[str]] = {state: [] for state in LIFECYCLE_STATES}

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
        proof_status = None
        proof_invalidates = None

        if ledger_entry is not None:
            proof_observed_at = ledger_entry.get("observed_at")
            proof_sha256 = ledger_entry.get("proof_sha256")
            proof_revision = ledger_entry.get("revision")
            proof_status = ledger_entry.get("status")
            proof_invalidates = ledger_entry.get("invalidates")
            effective_proof_uri = str(ledger_entry.get("proof_uri", source_proof_uri)).strip()
            ledger_status = str(ledger_entry.get("status", "")).strip().lower()
            if passing_status(ledger_entry.get("status")):
                effective_status = "complete"
                effective_next_action = next_action_for(task_id, ledger_entry, children)
            elif ledger_status in INVALIDATING_PROOF_STATUSES:
                claimed_source_status = ledger_entry.get("restores_source_status")
                if not isinstance(claimed_source_status, str) or not claimed_source_status.strip():
                    raise StatusError(
                        f"{task_id}: invalidated proof requires restores_source_status"
                    )
                source_lifecycle = lifecycle_state(source_status, None)
                claimed_lifecycle = lifecycle_state(claimed_source_status, None)
                if source_lifecycle != claimed_lifecycle:
                    raise StatusError(
                        f"{task_id}: invalidated proof restores_source_status "
                        f"{claimed_source_status!r} does not match source status {source_status!r}"
                    )
                if source_lifecycle == "complete":
                    raise StatusError(
                        f"{task_id}: invalidated proof requires a non-complete source status"
                    )
                invalidated_task_ids.append(task_id)

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

        lifecycle = lifecycle_state(source_status, ledger_entry)
        lifecycle_buckets.setdefault(lifecycle, []).append(task_id)
        if lifecycle == "complete":
            complete_task_ids.append(task_id)
        if lifecycle == EXECUTABLE_LIFECYCLE:
            ready_task_ids.append(task_id)

        status_tasks.append(
            {
                "task_id": task_id,
                "source_row_number": task.get("source_row_number"),
                "title": task.get("title", ""),
                "phase": task.get("phase", ""),
                "parent_ids": task.get("parent_ids", []),
                "lifecycle_state": lifecycle,
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
                    "status": proof_status,
                    "observed_at": proof_observed_at,
                    "revision": proof_revision,
                    "sha256": proof_sha256,
                    "invalidates": proof_invalidates,
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
        "global_coverage_gate": "open" if coverage_gate_open else "closed",
        "updated_task_ids": updated_task_ids,
        "complete_task_ids": complete_task_ids,
        "ready_task_ids": ready_task_ids,
        "invalidated_task_ids": invalidated_task_ids,
        "next_ready_task_id": ready_task_ids[0] if (ready_task_ids and coverage_gate_open) else None,
        "lifecycle_counts": {state: len(lifecycle_buckets.get(state, [])) for state in LIFECYCLE_STATES},
        "draft_task_ids": lifecycle_buckets.get("draft", []),
        "blocked_task_ids": lifecycle_buckets.get("blocked", []),
        "running_task_ids": lifecycle_buckets.get("running", []),
        "simulated_task_ids": lifecycle_buckets.get("simulated", []),
        "rolled_back_task_ids": lifecycle_buckets.get("rolled-back", []),
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
    parser.add_argument(
        "--coverage-gate",
        choices=("open", "closed"),
        default="closed",
        help=(
            "Global North Star coverage gate. Fail-closed by default: while closed, "
            "next_ready_task_id is null even if ready tasks exist."
        ),
    )
    args = parser.parse_args()

    try:
        status = status_projection(args.normalized_json, args.ledger, args.coverage_gate)
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
