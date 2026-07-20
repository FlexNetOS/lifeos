#!/usr/bin/env python3
"""Append proof records into a JSONL proof ledger."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from reproducible_time import utc_now


LEDGER_SCHEMA_VERSION = "lifeos-planning-spine.proof-ledger.v0"
REPORT_SCHEMA_VERSION = "lifeos-planning-spine.proof-ledger.merge-report.v0"
INVALIDATED_STATUS = "invalidated"
RESOLUTION_STATUS = "conflict-resolved"
ACCEPTED_DISPOSITION = "accepted"
SUPERSEDED_DISPOSITION = "superseded"
RESOLUTIONS_SCHEMA_VERSION = "lifeos-planning-spine.proof-ledger.conflict-resolutions.v0"
RESOLUTION_REPORT_SCHEMA_VERSION = "lifeos-planning-spine.proof-ledger.resolution-report.v0"
AUDIT_REPORT_SCHEMA_VERSION = "lifeos-planning-spine.proof-ledger.audit-report.v0"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class MergeError(Exception):
    pass


@dataclass(frozen=True)
class ProofRecord:
    path: Path
    task_id: str
    status: str
    observed_at: str
    revision: str
    sha256: str
    verified_by: str | None = None
    verified_at: str | None = None
    restores_source_status: str | None = None
    invalidation_reason: str | None = None
    invalidates: dict[str, Any] | None = None


@dataclass(frozen=True)
class LedgerRecord:
    task_id: str
    revision: str
    proof_sha256: str


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise MergeError(f"{path}: invalid JSON: {error}") from error
    if not isinstance(data, dict):
        raise MergeError(f"{path}: proof record must be a JSON object")
    return data


def revision_value(data: dict[str, Any], observed_at: str) -> str:
    raw = data.get("revision", data.get("proof_revision"))
    if raw is None:
        return observed_at
    if isinstance(raw, int) and raw >= 0:
        return str(raw)
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    raise MergeError("revision/proof_revision must be a non-negative integer or non-empty string")


def required_text(data: dict[str, Any], field: str, path: Path) -> str:
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise MergeError(f"{path}: invalidated proof requires non-empty {field}")
    return value.strip()


def invalidation_fields(
    data: dict[str, Any], path: Path, revision: str
) -> tuple[str, str, str, str, dict[str, Any]]:
    if not revision.isdigit() or int(revision) < 2:
        raise MergeError(f"{path}: invalidated proof requires revision 2 or later")

    verified_by = required_text(data, "verified_by", path)
    verified_at = required_text(data, "verified_at", path)
    restores_source_status = required_text(data, "restores_source_status", path)
    invalidation_reason = required_text(data, "invalidation_reason", path)
    invalidates = data.get("invalidates")
    if not isinstance(invalidates, dict):
        raise MergeError(f"{path}: invalidated proof requires an invalidates object")

    prior_revision = invalidates.get("revision")
    if isinstance(prior_revision, int):
        prior_revision = str(prior_revision)
    if not isinstance(prior_revision, str) or not prior_revision.strip():
        raise MergeError(f"{path}: invalidates.revision is required")
    proof_uri = invalidates.get("proof_uri")
    if not isinstance(proof_uri, str) or not proof_uri.strip():
        raise MergeError(f"{path}: invalidates.proof_uri is required")
    proof_sha256 = invalidates.get("proof_sha256")
    if not isinstance(proof_sha256, str) or not SHA256_RE.fullmatch(proof_sha256.strip().lower()):
        raise MergeError(f"{path}: invalidates.proof_sha256 must be a 64-character SHA-256")
    ledger_accepted = invalidates.get("ledger_accepted")
    if not isinstance(ledger_accepted, bool):
        raise MergeError(f"{path}: invalidates.ledger_accepted must be boolean")
    ledger_sequence = invalidates.get("ledger_sequence")
    if ledger_accepted and (not isinstance(ledger_sequence, int) or ledger_sequence < 1):
        raise MergeError(
            f"{path}: accepted invalidated proof requires a positive invalidates.ledger_sequence"
        )
    if not ledger_accepted and ledger_sequence is not None:
        raise MergeError(
            f"{path}: unaccepted invalidated proof requires null invalidates.ledger_sequence"
        )

    normalized_invalidates = dict(invalidates)
    normalized_invalidates["revision"] = prior_revision.strip()
    normalized_invalidates["proof_uri"] = proof_uri.strip()
    normalized_invalidates["proof_sha256"] = proof_sha256.strip().lower()
    return (
        verified_by,
        verified_at,
        restores_source_status,
        invalidation_reason,
        normalized_invalidates,
    )


def load_proof_record(path: Path) -> ProofRecord:
    data = load_json(path)
    task_id = data.get("task_id")
    if not isinstance(task_id, str) or not task_id.strip():
        raise MergeError(f"{path}: task_id is required")
    status = data.get("status")
    if not isinstance(status, str) or not status.strip():
        raise MergeError(f"{path}: status is required")
    observed_at = data.get("observed_at")
    if not isinstance(observed_at, str) or not observed_at.strip():
        raise MergeError(f"{path}: observed_at is required")
    try:
        revision = revision_value(data, observed_at.strip())
    except MergeError as error:
        raise MergeError(f"{path}: {error}") from error
    status_text = status.strip()
    verified_by = None
    verified_at = None
    restores_source_status = None
    invalidation_reason = None
    invalidates = None
    if status_text.lower() == INVALIDATED_STATUS:
        (
            verified_by,
            verified_at,
            restores_source_status,
            invalidation_reason,
            invalidates,
        ) = invalidation_fields(data, path, revision)

    return ProofRecord(
        path=path,
        task_id=task_id.strip(),
        status=status_text,
        observed_at=observed_at.strip(),
        revision=revision,
        sha256=sha256_file(path),
        verified_by=verified_by,
        verified_at=verified_at,
        restores_source_status=restores_source_status,
        invalidation_reason=invalidation_reason,
        invalidates=invalidates,
    )


def discover_proofs(proof_dir: Path) -> list[Path]:
    if not proof_dir.exists():
        raise MergeError(f"proof directory does not exist: {proof_dir}")
    return sorted(path for path in proof_dir.glob("*.proof.json") if path.is_file())


@dataclass
class LedgerAnalysis:
    entries: list[dict[str, Any]]
    max_sequence: int
    proof_lines: dict[tuple[str, str], list[dict[str, Any]]]
    resolutions: dict[tuple[str, str], dict[str, Any]]
    resolved_conflicts: list[dict[str, Any]]
    unresolved_conflicts: list[dict[str, Any]]
    errors: list[str]
    effective_index: dict[tuple[str, str], LedgerRecord]


def validate_resolution_record(
    entry: dict[str, Any], key: tuple[str, str], prior_identities: list[dict[str, Any]]
) -> str | None:
    """Return a problem description when a conflict-resolved record is invalid."""
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


def analyze_ledger(path: Path) -> LedgerAnalysis:
    """Parse the append-only ledger and reconcile duplicate task/revision identities.

    Proof lines sharing (task_id, revision) but disagreeing on proof_sha256 form a
    conflict. A conflict is resolved only by a later conflict-resolved record whose
    resolves object names every recorded identity and accepts exactly one of them.
    Raw lines are never rewritten; resolution is strictly append-only.
    """
    entries: list[dict[str, Any]] = []
    proof_lines: dict[tuple[str, str], list[dict[str, Any]]] = {}
    acceptance: dict[tuple[str, str], dict[str, Any]] = {}
    resolutions: dict[tuple[str, str], dict[str, Any]] = {}
    errors: list[str] = []
    max_sequence = 0
    if not path.exists():
        return LedgerAnalysis([], 0, {}, {}, [], [], [], {})

    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as error:
            raise MergeError(f"{path}:{line_number}: invalid ledger JSONL: {error}") from error
        if not isinstance(entry, dict):
            raise MergeError(f"{path}:{line_number}: ledger line must be a JSON object")
        task_id = entry.get("task_id")
        if not isinstance(task_id, str) or not task_id.strip():
            raise MergeError(f"{path}:{line_number}: task_id is required")
        revision = entry.get("revision")
        if revision is None:
            revision = entry.get("observed_at")
        if not isinstance(revision, str) or not revision.strip():
            raise MergeError(f"{path}:{line_number}: revision or observed_at is required")
        proof_sha256 = entry.get("proof_sha256", entry.get("source_sha256"))
        if not isinstance(proof_sha256, str) or not proof_sha256.strip():
            raise MergeError(f"{path}:{line_number}: proof_sha256 is required")

        sequence = entry.get("sequence")
        if not isinstance(sequence, int):
            sequence = line_number
        max_sequence = max(max_sequence, sequence)
        key = (task_id.strip(), revision.strip())
        status = str(entry.get("status", "")).strip().lower()
        entries.append(entry)

        if status == RESOLUTION_STATUS:
            problem = validate_resolution_record(entry, key, proof_lines.get(key, []))
            if problem is not None:
                errors.append(
                    f"{path}:{line_number}: invalid conflict-resolution record for "
                    f"{key[0]} revision {key[1]}: {problem}"
                )
                continue
            resolves = entry["resolves"]
            acceptance[key] = {
                "sequence": sequence,
                "accepted_sequence": resolves["accepted_sequence"],
                "accepted_proof_sha256": resolves["accepted_proof_sha256"],
            }
            resolutions[key] = {
                "task_id": key[0],
                "revision": key[1],
                "identities": [dict(item) for item in resolves["identities"]],
                "accepted_sequence": resolves["accepted_sequence"],
                "accepted_proof_sha256": resolves["accepted_proof_sha256"],
                "resolution_sequence": sequence,
                "verified_by": entry["verified_by"],
                "verified_at": entry["verified_at"],
                "resolution_reason": entry["resolution_reason"],
            }
            continue

        if "resolves" in entry:
            errors.append(
                f"{path}:{line_number}: only conflict-resolved records may carry a resolves object"
            )
            continue
        proof_lines.setdefault(key, []).append(
            {
                "sequence": sequence,
                "proof_sha256": proof_sha256.strip(),
                "proof_uri": str(entry.get("proof_uri", "")).strip(),
                "line_number": line_number,
                "status": str(entry.get("status", "")).strip(),
            }
        )

    resolved_conflicts: list[dict[str, Any]] = []
    unresolved_conflicts: list[dict[str, Any]] = []
    effective_index: dict[tuple[str, str], LedgerRecord] = {}
    for key in sorted(set(proof_lines) | set(acceptance)):
        lines = proof_lines.get(key, [])
        accepted = acceptance.get(key)
        if accepted is not None:
            diverged = [
                line
                for line in lines
                if line["sequence"] > accepted["sequence"]
                and line["proof_sha256"] != accepted["accepted_proof_sha256"]
            ]
            if diverged:
                unresolved_conflicts.append(
                    {
                        "task_id": key[0],
                        "revision": key[1],
                        "identities": [
                            {"sequence": line["sequence"], "proof_sha256": line["proof_sha256"]}
                            for line in lines
                        ],
                    }
                )
                continue
            resolved_conflicts.append(resolutions[key])
            effective_index[key] = LedgerRecord(key[0], key[1], accepted["accepted_proof_sha256"])
            continue
        digests = {line["proof_sha256"] for line in lines}
        if len(digests) > 1:
            unresolved_conflicts.append(
                {
                    "task_id": key[0],
                    "revision": key[1],
                    "identities": [
                        {"sequence": line["sequence"], "proof_sha256": line["proof_sha256"]}
                        for line in lines
                    ],
                }
            )
            continue
        if lines:
            effective_index[key] = LedgerRecord(key[0], key[1], lines[-1]["proof_sha256"])

    return LedgerAnalysis(
        entries=entries,
        max_sequence=max_sequence,
        proof_lines=proof_lines,
        resolutions=resolutions,
        resolved_conflicts=resolved_conflicts,
        unresolved_conflicts=unresolved_conflicts,
        errors=errors,
        effective_index=effective_index,
    )


def unresolved_conflict_text(conflict: dict[str, Any]) -> str:
    identities = ", ".join(
        f"sequence {item['sequence']} digest {item['proof_sha256']}"
        for item in conflict["identities"]
    )
    return f"{conflict['task_id']} revision {conflict['revision']} ({identities})"


def load_ledger(path: Path) -> tuple[list[dict[str, Any]], dict[tuple[str, str], LedgerRecord]]:
    analysis = analyze_ledger(path)
    if analysis.errors:
        raise MergeError("; ".join(analysis.errors))
    if analysis.unresolved_conflicts:
        details = "; ".join(
            unresolved_conflict_text(conflict) for conflict in analysis.unresolved_conflicts
        )
        raise MergeError(
            "unresolved ledger conflict(s): "
            f"{details} — append an independent-verifier conflict-resolved record "
            "naming every identity before merging"
        )
    return analysis.entries, analysis.effective_index


def check_input_duplicates(records: list[ProofRecord]) -> None:
    seen: dict[tuple[str, str], ProofRecord] = {}
    for record in records:
        key = (record.task_id, record.revision)
        existing = seen.get(key)
        if existing is None:
            seen[key] = record
            continue
        if existing.sha256 != record.sha256:
            raise MergeError(
                "duplicate task_id/revision with different sha256: "
                f"{record.task_id} revision {record.revision} at {existing.path} and {record.path}"
            )


def ledger_entry(record: ProofRecord, sequence: int, generated_at: str) -> dict[str, Any]:
    entry = {
        "schema_version": LEDGER_SCHEMA_VERSION,
        "sequence": sequence,
        "generated_at": generated_at,
        "task_id": record.task_id,
        "status": record.status,
        "observed_at": record.observed_at,
        "revision": record.revision,
        "proof_uri": str(record.path),
        "proof_sha256": record.sha256,
    }
    if record.status.lower() == INVALIDATED_STATUS:
        entry.update(
            {
                "verified_by": record.verified_by,
                "verified_at": record.verified_at,
                "restores_source_status": record.restores_source_status,
                "invalidation_reason": record.invalidation_reason,
                "invalidates": record.invalidates,
            }
        )
    return entry


def append_entries(path: Path, entries: list[dict[str, Any]], dry_run: bool) -> None:
    if dry_run or not entries:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for entry in entries:
            handle.write(json.dumps(entry, sort_keys=True) + "\n")


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def merge_records(proof_dir: Path, ledger_path: Path, report_path: Path, dry_run: bool) -> dict[str, Any]:
    proof_paths = discover_proofs(proof_dir)
    if not proof_paths:
        raise MergeError(f"no proof records found in {proof_dir}")

    records = [load_proof_record(path) for path in proof_paths]
    check_input_duplicates(records)
    existing_entries, existing_index = load_ledger(ledger_path)

    generated_at = utc_now()
    appendable: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    conflicts: list[dict[str, str]] = []

    for record in sorted(records, key=lambda item: (item.task_id, item.revision, str(item.path))):
        key = (record.task_id, record.revision)
        existing = existing_index.get(key)
        if existing is None:
            appendable.append(ledger_entry(record, len(existing_entries) + len(appendable) + 1, generated_at))
            continue
        if existing.proof_sha256 == record.sha256:
            skipped.append({"task_id": record.task_id, "revision": record.revision, "path": str(record.path)})
            continue
        conflicts.append(
            {
                "task_id": record.task_id,
                "revision": record.revision,
                "path": str(record.path),
                "existing_sha256": existing.proof_sha256,
                "new_sha256": record.sha256,
            }
        )

    if conflicts:
        conflict_text = "; ".join(f"{item['task_id']} revision {item['revision']}" for item in conflicts)
        raise MergeError(f"conflicting proof record(s) already exist in ledger: {conflict_text}")

    append_entries(ledger_path, appendable, dry_run)
    report = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "generated_at": generated_at,
        "proof_dir": str(proof_dir),
        "ledger_path": str(ledger_path),
        "dry_run": dry_run,
        "result": "pass",
        "input_proof_count": len(records),
        "existing_entry_count": len(existing_entries),
        "appended_entry_count": len(appendable),
        "skipped_entry_count": len(skipped),
        "final_entry_count": len(existing_entries) + (0 if dry_run else len(appendable)),
        "appended_entries": appendable,
        "skipped_entries": skipped,
    }
    write_json(report_path, report)
    return report


def audit_ledger(ledger_path: Path) -> dict[str, Any]:
    """Read-only conflict audit of the append-only ledger."""
    analysis = analyze_ledger(ledger_path)
    resolution_count = sum(
        1
        for entry in analysis.entries
        if str(entry.get("status", "")).strip().lower() == RESOLUTION_STATUS
    )
    return {
        "schema_version": AUDIT_REPORT_SCHEMA_VERSION,
        "generated_at": utc_now(),
        "ledger_path": str(ledger_path),
        "entry_count": len(analysis.entries),
        "proof_entry_count": len(analysis.entries) - resolution_count,
        "resolution_entry_count": resolution_count,
        "resolved_conflicts": sorted(
            analysis.resolved_conflicts,
            key=lambda item: (item["task_id"], item["revision"]),
        ),
        "unresolved_conflicts": sorted(
            analysis.unresolved_conflicts,
            key=lambda item: (item["task_id"], item["revision"]),
        ),
        "errors": analysis.errors,
        "result": "pass" if not analysis.errors and not analysis.unresolved_conflicts else "fail",
    }


def resolve_conflicts(
    resolutions_path: Path,
    proof_dir: Path,
    ledger_path: Path,
    report_path: Path,
    dry_run: bool,
) -> dict[str, Any]:
    """Append independent-verifier conflict-resolution records to the ledger."""
    document = load_json(resolutions_path)
    if document.get("schema_version") != RESOLUTIONS_SCHEMA_VERSION:
        raise MergeError(
            f"{resolutions_path}: schema_version must be {RESOLUTIONS_SCHEMA_VERSION!r}"
        )
    verified_by = required_text(document, "verified_by", resolutions_path)
    verified_at = required_text(document, "verified_at", resolutions_path)
    items = document.get("resolutions")
    if not isinstance(items, list) or not items:
        raise MergeError(f"{resolutions_path}: resolutions must be a non-empty array")

    analysis = analyze_ledger(ledger_path)
    if analysis.errors:
        raise MergeError("; ".join(analysis.errors))
    unresolved_keys = {
        (conflict["task_id"], conflict["revision"]): conflict
        for conflict in analysis.unresolved_conflicts
    }
    latest_sequence_by_task: dict[str, int] = {}
    for key, lines in analysis.proof_lines.items():
        for line in lines:
            latest_sequence_by_task[key[0]] = max(
                latest_sequence_by_task.get(key[0], 0), line["sequence"]
            )

    generated_at = utc_now()
    appendable: list[dict[str, Any]] = []
    applied: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    next_sequence = analysis.max_sequence + 1

    def item_key(item: dict[str, Any]) -> tuple[str, str]:
        return (str(item.get("task_id", "")).strip(), str(item.get("revision", "")).strip())

    for item in sorted(items, key=item_key):
        if not isinstance(item, dict):
            raise MergeError(f"{resolutions_path}: each resolution must be an object")
        key = item_key(item)
        if not key[0] or not key[1]:
            raise MergeError(f"{resolutions_path}: each resolution requires task_id and revision")
        lines = analysis.proof_lines.get(key, [])
        if not lines:
            raise MergeError(
                f"{resolutions_path}: {key[0]} revision {key[1]} has no ledger identities"
            )
        existing = analysis.resolutions.get(key)
        if existing is not None and key not in unresolved_keys:
            if existing["accepted_proof_sha256"] == item.get("accepted_proof_sha256"):
                skipped.append(
                    {"task_id": key[0], "revision": key[1], "reason": "already resolved"}
                )
                continue
            raise MergeError(
                f"{resolutions_path}: {key[0]} revision {key[1]} is already resolved "
                "with a different accepted identity"
            )
        if key not in unresolved_keys:
            raise MergeError(
                f"{resolutions_path}: {key[0]} revision {key[1]} has no unresolved digest conflict"
            )
        accepted_sequence = item.get("accepted_sequence")
        accepted_line = next(
            (line for line in lines if line["sequence"] == accepted_sequence), None
        )
        if accepted_line is None:
            raise MergeError(
                f"{resolutions_path}: {key[0]} revision {key[1]}: accepted_sequence "
                f"{accepted_sequence!r} does not name a recorded ledger identity"
            )
        if latest_sequence_by_task.get(key[0]) == accepted_line["sequence"]:
            proof_path = proof_dir / Path(accepted_line["proof_uri"]).name
            if not proof_path.is_file():
                raise MergeError(
                    f"{resolutions_path}: {key[0]} revision {key[1]}: accepted proof "
                    f"artifact does not exist at {proof_path}"
                )
            on_disk = sha256_file(proof_path)
            if on_disk != item.get("accepted_proof_sha256"):
                raise MergeError(
                    f"{resolutions_path}: {key[0]} revision {key[1]}: accepted digest "
                    f"{item.get('accepted_proof_sha256')!r} does not match the on-disk "
                    f"proof artifact {proof_path} ({on_disk})"
                )
        entry = {
            "schema_version": LEDGER_SCHEMA_VERSION,
            "sequence": next_sequence,
            "generated_at": generated_at,
            "task_id": key[0],
            "status": RESOLUTION_STATUS,
            "observed_at": verified_at,
            "revision": key[1],
            "proof_uri": accepted_line["proof_uri"],
            "proof_sha256": item.get("accepted_proof_sha256"),
            "verified_by": verified_by,
            "verified_at": verified_at,
            "resolution_reason": str(item.get("reason", "")).strip(),
            "resolves": {
                "task_id": key[0],
                "revision": key[1],
                "identities": item.get("identities"),
                "accepted_sequence": accepted_sequence,
                "accepted_proof_sha256": item.get("accepted_proof_sha256"),
            },
        }
        problem = validate_resolution_record(entry, key, lines)
        if problem is not None:
            raise MergeError(f"{resolutions_path}: {key[0]} revision {key[1]}: {problem}")
        appendable.append(entry)
        applied.append(
            {
                "task_id": key[0],
                "revision": key[1],
                "sequence": next_sequence,
                "accepted_sequence": accepted_sequence,
                "accepted_proof_sha256": item.get("accepted_proof_sha256"),
            }
        )
        next_sequence += 1

    covered = {(item["task_id"], item["revision"]) for item in applied}
    remaining = sorted(key for key in unresolved_keys if key not in covered)
    append_entries(ledger_path, appendable, dry_run)
    report = {
        "schema_version": RESOLUTION_REPORT_SCHEMA_VERSION,
        "generated_at": generated_at,
        "ledger_path": str(ledger_path),
        "resolutions_path": str(resolutions_path),
        "dry_run": dry_run,
        "verified_by": verified_by,
        "verified_at": verified_at,
        "applied_count": len(applied),
        "skipped_count": len(skipped),
        "applied": applied,
        "skipped": skipped,
        "remaining_unresolved": [
            {"task_id": task_id, "revision": revision} for task_id, revision in remaining
        ],
        "appended_entries": appendable,
        "result": "pass" if not remaining else "fail",
    }
    write_json(report_path, report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Append proof_records/*.proof.json into proof_ledger.jsonl.")
    parser.add_argument(
        "proof_dir",
        type=Path,
        nargs="?",
        default=Path("proof_records"),
        help="Directory containing proof_records/*.proof.json",
    )
    parser.add_argument(
        "--ledger",
        type=Path,
        default=Path("proof_records/proof_ledger.jsonl"),
        help="Append-only JSONL ledger output path",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Machine-readable report output path",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without appending")
    parser.add_argument(
        "--audit",
        action="store_true",
        help="Read-only audit of duplicate-revision digest conflicts; fails while any conflict is unresolved",
    )
    parser.add_argument(
        "--resolve",
        type=Path,
        default=None,
        metavar="RESOLUTIONS_JSON",
        help="Append independent-verifier conflict-resolved records described by RESOLUTIONS_JSON",
    )
    args = parser.parse_args()
    if args.audit and args.resolve is not None:
        parser.error("--audit and --resolve are mutually exclusive")

    try:
        if args.audit:
            report = audit_ledger(args.ledger)
            print(json.dumps(report, indent=2, sort_keys=True))
            if args.report is not None:
                write_json(args.report, report)
            return 0 if report["result"] == "pass" else 1
        if args.resolve is not None:
            report_path = args.report or Path("proof_records/proof_ledger.resolution_report.json")
            report = resolve_conflicts(
                args.resolve, args.proof_dir, args.ledger, report_path, args.dry_run
            )
            verb = "would append" if args.dry_run else "appended"
            print(
                f"merge-proof-records: {verb} {report['applied_count']} resolution record(s), "
                f"skipped {report['skipped_count']} already-resolved, "
                f"{len(report['remaining_unresolved'])} conflict(s) still unresolved, "
                f"ledger {args.ledger}"
            )
            return 0 if report["result"] == "pass" else 1
        report_path = args.report or Path("proof_records/proof_ledger.merge_report.json")
        report = merge_records(args.proof_dir, args.ledger, report_path, args.dry_run)
    except MergeError as error:
        print(f"merge-proof-records: error: {error}", file=sys.stderr)
        return 1

    verb = "would append" if args.dry_run else "appended"
    print(
        f"merge-proof-records: {verb} {report['appended_entry_count']} entrie(s), "
        f"skipped {report['skipped_entry_count']} existing entrie(s), ledger {args.ledger}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
