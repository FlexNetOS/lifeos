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


def load_ledger(path: Path) -> tuple[list[dict[str, Any]], dict[tuple[str, str], LedgerRecord]]:
    if not path.exists():
        return [], {}

    entries: list[dict[str, Any]] = []
    index: dict[tuple[str, str], LedgerRecord] = {}
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

        key = (task_id.strip(), revision.strip())
        if key in index and index[key].proof_sha256 != proof_sha256.strip():
            raise MergeError(f"{path}:{line_number}: conflicting ledger entry for {key[0]} revision {key[1]}")
        index[key] = LedgerRecord(key[0], key[1], proof_sha256.strip())
        entries.append(entry)
    return entries, index


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
        default=Path("proof_records/proof_ledger.merge_report.json"),
        help="Machine-readable merge report output path",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without appending")
    args = parser.parse_args()

    try:
        report = merge_records(args.proof_dir, args.ledger, args.report, args.dry_run)
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
