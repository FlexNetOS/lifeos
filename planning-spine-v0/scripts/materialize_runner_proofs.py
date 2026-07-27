#!/usr/bin/env python3
"""Materialize immutable json_task_runner receipts into artifacts and proofs.

This is deliberately a post-execution bridge. It does not execute packets, mutate a
run snapshot, or infer implementation from a successful drift canary. It validates
the selected receipt and every referenced log hash before writing receipt-bound
result artifacts, proof records, and append-only ledger events.
"""

from __future__ import annotations

import argparse
import fcntl
import glob
import json
import os
import shlex
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

import json_task_runner as runner


RESULT_SCHEMA = "lifeos.receipt-bound-task-result.v1"
MATERIALIZATION_SCHEMA = "lifeos.runner-proof-materialization.v1"
REPORT_SCHEMA = "lifeos.runner-proof-materialization-report.v1"


class MaterializationError(RuntimeError):
    """Receipt, graph, artifact, or proof integrity validation failed."""


@dataclass(frozen=True)
class ReceiptBinding:
    path: Path
    sha256: str
    value: dict[str, Any]
    verification_executed: bool


@dataclass(frozen=True)
class DeclaredArtifact:
    declaration: str
    kind: str
    path: Path | None


@dataclass(frozen=True)
class RunContext:
    repo_root: Path
    receipts_dir: Path
    run_dir: Path
    execution_framework_root: Path
    run_id: str
    graph_sha256: str
    tasks: dict[str, runner.Task]


def _load_json(path: Path, description: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise MaterializationError(f"invalid {description} {path}: {error}") from error
    if not isinstance(value, dict):
        raise MaterializationError(f"{description} must be a JSON object: {path}")
    return value


def _relative_or_absolute(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def _safe_child(path: Path, root: Path, description: str) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError as error:
        raise MaterializationError(
            f"{description} escapes {root}: {path}"
        ) from error
    return resolved


def _string_list(value: Any, field: str, task_id: str) -> list[str]:
    if value in (None, ""):
        return []
    if isinstance(value, str):
        return [part.strip() for part in value.split("|") if part.strip()]
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return [item.strip() for item in value if item.strip()]
    raise MaterializationError(
        f"{task_id}: {field} must be text or an array of text"
    )


def load_run_context(
    repo_root: Path,
    receipts_dir: Path,
    execution_framework_root: Path,
    run_id: str,
) -> RunContext:
    repo_root = repo_root.resolve()
    receipts_dir = receipts_dir.resolve()
    execution_framework_root = execution_framework_root.resolve()
    run_dir = _safe_child(
        receipts_dir / "runs" / run_id,
        receipts_dir,
        "run directory",
    )
    if not run_dir.is_dir():
        raise MaterializationError(f"run does not exist: {run_dir}")
    if not execution_framework_root.is_dir():
        raise MaterializationError(
            f"execution-framework root does not exist: {execution_framework_root}"
        )

    try:
        tasks, snapshot_run_id = runner.load_snapshot(run_dir, repo_root)
    except runner.RunnerError as error:
        raise MaterializationError(str(error)) from error
    if snapshot_run_id != run_id:
        raise MaterializationError(
            f"snapshot run ID mismatch: expected {run_id}, got {snapshot_run_id}"
        )
    graph_digest = runner.graph_sha256(tasks)
    run_receipt = _load_json(run_dir / "run.json", "run receipt")
    expected_counts = {
        "blocked": 0,
        "completed": len(tasks),
        "failed": 0,
        "pending": 0,
    }
    if (
        run_receipt.get("schema") != runner.RUN_SCHEMA
        or run_receipt.get("run_id") != run_id
        or run_receipt.get("graph_sha256") != graph_digest
        or run_receipt.get("task_count") != len(tasks)
        or run_receipt.get("status_counts") != expected_counts
    ):
        raise MaterializationError(
            f"run receipt is not a completed exact-graph receipt: {run_dir / 'run.json'}"
        )
    return RunContext(
        repo_root=repo_root,
        receipts_dir=receipts_dir,
        run_dir=run_dir,
        execution_framework_root=execution_framework_root,
        run_id=run_id,
        graph_sha256=graph_digest,
        tasks=tasks,
    )


def _validate_stream(
    stream: Any,
    context: RunContext,
    task_id: str,
    label: str,
) -> None:
    if not isinstance(stream, dict):
        raise MaterializationError(f"{task_id}: {label} stream metadata is invalid")
    raw_path = stream.get("path")
    expected_digest = stream.get("sha256")
    if not isinstance(raw_path, str) or not isinstance(expected_digest, str):
        raise MaterializationError(f"{task_id}: {label} stream binding is incomplete")
    path = _safe_child(Path(raw_path), context.receipts_dir, f"{label} log")
    if not path.is_file():
        raise MaterializationError(f"{task_id}: {label} log does not exist: {path}")
    observed_digest = runner.sha256_file(path)
    if observed_digest != expected_digest:
        raise MaterializationError(
            f"{task_id}: {label} log digest mismatch: "
            f"expected {expected_digest}, got {observed_digest}"
        )


def _validate_command_result(
    result: Any,
    context: RunContext,
    task_id: str,
    label: str,
) -> None:
    if not isinstance(result, dict):
        raise MaterializationError(f"{task_id}: {label} result is invalid")
    if result.get("exit_code") != 0 or result.get("timed_out") is not False:
        raise MaterializationError(f"{task_id}: {label} did not complete successfully")
    argv = result.get("argv")
    if not isinstance(argv, list) or not argv or not all(
        isinstance(item, str) for item in argv
    ):
        raise MaterializationError(f"{task_id}: {label} argv is invalid")
    _validate_stream(result.get("stdout"), context, task_id, f"{label} stdout")
    _validate_stream(result.get("stderr"), context, task_id, f"{label} stderr")


def _validate_origin_graph(
    context: RunContext,
    receipt: dict[str, Any],
    task: runner.Task,
) -> None:
    origin_run_id = receipt.get("run_id")
    origin_graph_digest = receipt.get("graph_sha256")
    if not isinstance(origin_run_id, str) or not isinstance(origin_graph_digest, str):
        raise MaterializationError(f"{task.task_id}: receipt origin is incomplete")
    origin_graph_path = context.receipts_dir / "runs" / origin_run_id / "graph.json"
    origin_graph = _load_json(origin_graph_path, "origin graph")
    if (
        origin_graph.get("run_id") != origin_run_id
        or origin_graph.get("graph_sha256") != origin_graph_digest
    ):
        raise MaterializationError(
            f"{task.task_id}: receipt origin graph binding is invalid"
        )
    rows = origin_graph.get("tasks")
    if not isinstance(rows, list):
        raise MaterializationError(
            f"{task.task_id}: receipt origin graph task list is invalid"
        )
    matching = [
        row
        for row in rows
        if isinstance(row, dict) and row.get("task_id") == task.task_id
    ]
    if len(matching) != 1 or matching[0].get("packet_sha256") != task.packet_sha256:
        raise MaterializationError(
            f"{task.task_id}: receipt is not bound to the exact packet in its origin graph"
        )


def _validate_approval(receipt: dict[str, Any], task: runner.Task) -> None:
    if not runner.approval_required(task):
        if receipt.get("execution_input_sha256") != task.packet_sha256:
            raise MaterializationError(
                f"{task.task_id}: unapproved packet execution input digest changed"
            )
        return
    authorization = receipt.get("authorization")
    if (
        not isinstance(authorization, dict)
        or authorization.get("status") != "approved"
        or not authorization.get("authorization_record_sha256")
        or authorization.get("execution_input_sha256")
        != receipt.get("execution_input_sha256")
    ):
        raise MaterializationError(
            f"{task.task_id}: completed receipt lacks a valid approval binding"
        )


def latest_receipt(context: RunContext, task: runner.Task) -> ReceiptBinding:
    directory = context.receipts_dir / task.task_id / task.packet_sha256
    if not directory.is_dir():
        raise MaterializationError(
            f"{task.task_id}: exact-digest receipt directory is missing"
        )
    observed: list[tuple[str, str, Path, dict[str, Any]]] = []
    for path in sorted(directory.glob("*.json")):
        receipt = _load_json(path, "execution receipt")
        if (
            receipt.get("schema") != runner.RECEIPT_SCHEMA
            or receipt.get("task_id") != task.task_id
            or receipt.get("packet_sha256") != task.packet_sha256
        ):
            raise MaterializationError(
                f"{task.task_id}: receipt identity mismatch: {path}"
            )
        observed.append(
            (
                str(receipt.get("finished_at", "")),
                path.name,
                path.resolve(),
                receipt,
            )
        )
    if not observed:
        raise MaterializationError(f"{task.task_id}: no exact-digest receipt exists")
    _, _, receipt_path, receipt = max(observed)
    if (
        receipt.get("status") != "completed"
        or receipt.get("exit_code") != 0
        or receipt.get("executor_refusal")
    ):
        raise MaterializationError(
            f"{task.task_id}: latest exact-digest receipt is not completed"
        )
    _validate_approval(receipt, task)
    _validate_origin_graph(context, receipt, task)

    packet_path_value = receipt.get("packet_path")
    if not isinstance(packet_path_value, str):
        raise MaterializationError(f"{task.task_id}: receipt packet path is missing")
    packet_path = _safe_child(
        Path(packet_path_value),
        context.receipts_dir,
        "receipt packet snapshot",
    )
    if runner.sha256_file(packet_path) != task.packet_sha256:
        raise MaterializationError(
            f"{task.task_id}: receipt packet snapshot digest mismatch"
        )

    _validate_command_result(receipt.get("command"), context, task.task_id, "command")
    verification = receipt.get("verification")
    verification_executed = not (
        isinstance(verification, dict) and verification.get("executed") is False
    )
    if verification_executed:
        _validate_command_result(
            verification,
            context,
            task.task_id,
            "verification",
        )
    elif not isinstance(verification, dict):
        raise MaterializationError(
            f"{task.task_id}: verification metadata is invalid"
        )
    return ReceiptBinding(
        path=receipt_path,
        sha256=runner.sha256_file(receipt_path),
        value=receipt,
        verification_executed=verification_executed,
    )


def resolve_proof_path(
    context: RunContext,
    task: runner.Task,
) -> Path:
    proof_uri = task.packet.get("proof_uri")
    if not isinstance(proof_uri, str) or not proof_uri.strip():
        raise MaterializationError(f"{task.task_id}: proof_uri is required")
    proof_uri = proof_uri.strip()
    if proof_uri.startswith("execution-framework/"):
        path = context.execution_framework_root.parent / proof_uri
    elif proof_uri.startswith("proof_records/"):
        path = context.execution_framework_root / proof_uri
    else:
        raise MaterializationError(
            f"{task.task_id}: unsupported proof_uri prefix: {proof_uri}"
        )
    return _safe_child(
        path,
        context.execution_framework_root / "proof_records",
        "proof path",
    )


def classify_artifacts(
    context: RunContext,
    task: runner.Task,
) -> list[DeclaredArtifact]:
    declarations = _string_list(
        task.packet.get("target_artifacts"),
        "target_artifacts",
        task.task_id,
    )
    classified: list[DeclaredArtifact] = []
    for declaration in declarations:
        if (
            Path(declaration).suffix == ""
            and (
                "/" not in declaration
                or any(character.isspace() for character in declaration)
            )
        ):
            classified.append(
                DeclaredArtifact(
                    declaration=declaration,
                    kind="descriptive",
                    path=None,
                )
            )
            continue
        if declaration.startswith("execution-framework/"):
            path = context.execution_framework_root.parent / declaration
        else:
            path = context.execution_framework_root / declaration
        path = _safe_child(
            path,
            context.execution_framework_root,
            "declared artifact",
        )
        if glob.has_magic(declaration):
            kind = "glob"
        elif (
            path.name == "result.json"
            and path.is_relative_to(
                context.execution_framework_root / "migration-artifacts"
            )
        ):
            kind = "receipt_result"
        else:
            kind = "file"
        classified.append(
            DeclaredArtifact(
                declaration=declaration,
                kind=kind,
                path=path,
            )
        )
    return classified


def implementation_scope(
    task: runner.Task,
    binding: ReceiptBinding,
) -> tuple[str, str, str]:
    gate_and_notes = " ".join(
        str(task.packet.get(field, ""))
        for field in ("completion_gate", "notes")
    ).lower()
    needs_probe = task.packet.get("needs_capability_probe") is True
    probe_class = str(task.packet.get("probe_class", ""))
    if (
        needs_probe
        or probe_class == "drift-canary"
        or "not evidence of implementation" in gate_and_notes
    ):
        return (
            "not_claimed",
            "This receipt proves only immutable packet execution; it is not "
            "implementation evidence.",
            "execute a real capability probe before claiming implementation",
        )
    if (
        task.task_id.startswith("INV-")
        and binding.verification_executed
    ):
        return (
            "declared_live_probe_passed",
            "The declared live invariant command and its verification exited zero; "
            "this proves that probe, not every semantic clause of the invariant.",
            "cross-check the probe against every invariant clause before claiming implementation",
        )
    if binding.verification_executed:
        return (
            "command_and_verification_passed",
            "The immutable packet command and its independently executed "
            "verification both exited zero.",
            "none",
        )
    return (
        "runner_command_completed",
        "The immutable packet command completed, but the declared verification "
        "was narrative or non-executable and was not independently run.",
        "add or run an executable verification before claiming independent verification",
    )


def _preserve_bytes(path: Path, content: bytes, write: bool) -> None:
    if path.exists():
        if path.read_bytes() != content:
            raise MaterializationError(f"history collision at {path}")
        return
    if write:
        runner.atomic_write_bytes(path, content)


def preserve_existing_proof(
    context: RunContext,
    task: runner.Task,
    proof_path: Path,
    write: bool,
) -> dict[str, str] | None:
    if not proof_path.is_file():
        return None
    content = proof_path.read_bytes()
    digest = runner.sha256_bytes(content)
    try:
        existing = json.loads(content)
    except json.JSONDecodeError:
        existing = None
    if isinstance(existing, dict):
        output = existing.get("verification_output")
        if (
            existing.get("actor") == "json-task-runner"
            and isinstance(output, dict)
            and output.get("materialization_schema") == MATERIALIZATION_SCHEMA
        ):
            preserved = output.get("preserved_task_proof")
            return preserved if isinstance(preserved, dict) else None
    history_path = (
        context.execution_framework_root
        / "proof_records"
        / "history"
        / task.task_id
        / f"{digest}.proof.json"
    )
    _preserve_bytes(history_path, content, write)
    return {
        "path": _relative_or_absolute(history_path, context.repo_root),
        "sha256": digest,
    }


def preserve_existing_artifact(
    context: RunContext,
    task: runner.Task,
    artifact_path: Path,
    write: bool,
) -> tuple[str | None, dict[str, str] | None]:
    if not artifact_path.is_file():
        return None, None
    content = artifact_path.read_bytes()
    digest = runner.sha256_bytes(content)
    try:
        existing = json.loads(content)
    except json.JSONDecodeError:
        existing = None
    if isinstance(existing, dict) and existing.get("schema") == RESULT_SCHEMA:
        prior = existing.get("prior_artifact_sha256")
        preserved = existing.get("preserved_artifact")
        return (
            prior if isinstance(prior, str) else None,
            preserved if isinstance(preserved, dict) else None,
        )
    history_path = (
        context.execution_framework_root
        / "migration-artifacts"
        / "runner-history"
        / task.task_id
        / f"{digest}.json"
    )
    _preserve_bytes(history_path, content, write)
    return (
        digest,
        {
            "path": _relative_or_absolute(history_path, context.repo_root),
            "sha256": digest,
        },
    )


def _artifact_status(
    artifact: DeclaredArtifact,
    result_paths: set[Path],
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "declaration": artifact.declaration,
        "kind": artifact.kind,
    }
    if artifact.kind == "descriptive":
        row["status"] = "descriptive_not_materialized"
    elif artifact.kind == "glob" and artifact.path is not None:
        matches = [
            Path(match).resolve()
            for match in sorted(glob.glob(str(artifact.path)))
            if Path(match).is_file()
        ]
        row["path"] = str(artifact.path)
        row["matches"] = [
            {
                "path": str(match),
                "sha256": runner.sha256_file(match),
            }
            for match in matches
        ]
        row["status"] = "existing_glob" if matches else "missing_declared_file"
    elif artifact.path in result_paths:
        row["status"] = "receipt_result_materialized"
        row["path"] = str(artifact.path)
    elif artifact.path is not None and artifact.path.is_file():
        row["status"] = "existing_file"
        row["path"] = str(artifact.path)
        row["sha256"] = runner.sha256_file(artifact.path)
    else:
        row["status"] = "missing_declared_file"
        row["path"] = str(artifact.path)
    return row


def _command_summary(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "argv": value["argv"],
        "cwd": value.get("cwd"),
        "exit_code": value["exit_code"],
        "stdout": value["stdout"],
        "stderr": value["stderr"],
    }


def _artifact_paths(statuses: Iterable[dict[str, Any]]) -> list[Path]:
    paths: list[Path] = []
    for row in statuses:
        if (
            row.get("status") in {"receipt_result_materialized", "existing_file"}
            and isinstance(row.get("path"), str)
        ):
            paths.append(Path(row["path"]))
        if row.get("status") == "existing_glob":
            matches = row.get("matches")
            if isinstance(matches, list):
                paths.extend(
                    Path(match["path"])
                    for match in matches
                    if isinstance(match, dict)
                    and isinstance(match.get("path"), str)
                )
    return list(dict.fromkeys(paths))


def build_result(
    context: RunContext,
    task: runner.Task,
    binding: ReceiptBinding,
    artifact_path: Path,
    artifact_statuses: list[dict[str, Any]],
    prior_artifact_sha256: str | None,
    preserved_artifact: dict[str, str] | None,
) -> dict[str, Any]:
    scope, honesty_note, _ = implementation_scope(task, binding)
    receipt = binding.value
    result: dict[str, Any] = {
        "schema": RESULT_SCHEMA,
        "task_id": task.task_id,
        "status": "passed",
        "packet_execution_proven": True,
        "task_completion_proven": True,
        "implementation_scope": scope,
        "honesty_note": honesty_note,
        "needs_capability_probe": task.packet.get("needs_capability_probe") is True,
        "probe_class": task.packet.get("probe_class"),
        "artifact_path": _relative_or_absolute(artifact_path, context.repo_root),
        "artifact_declarations": artifact_statuses,
        "orchestration": {
            "run_id": context.run_id,
            "graph_sha256": context.graph_sha256,
        },
        "origin_receipt": {
            "run_id": receipt["run_id"],
            "graph_sha256": receipt["graph_sha256"],
            "attempt_id": receipt["attempt_id"],
            "path": str(binding.path),
            "sha256": binding.sha256,
        },
        "packet_sha256": task.packet_sha256,
        "completed_at": receipt["finished_at"],
        "command": _command_summary(receipt["command"]),
        "verification": (
            _command_summary(receipt["verification"])
            if binding.verification_executed
            else receipt["verification"]
        ),
        "prior_artifact_sha256": prior_artifact_sha256,
    }
    if preserved_artifact is not None:
        result["preserved_artifact"] = preserved_artifact
    return result


def _command_line(result: dict[str, Any]) -> str:
    return shlex.join(str(item) for item in result["argv"])


def build_proof(
    context: RunContext,
    task: runner.Task,
    binding: ReceiptBinding,
    artifact_statuses: list[dict[str, Any]],
    preserved_task_proof: dict[str, str] | None,
) -> dict[str, Any]:
    receipt = binding.value
    scope, honesty_note, next_action = implementation_scope(task, binding)
    missing = [
        row["declaration"]
        for row in artifact_statuses
        if row["status"] == "missing_declared_file"
    ]
    if missing:
        next_action = "materialize missing declared file artifacts: " + ", ".join(missing)
    commands = [_command_line(receipt["command"])]
    if binding.verification_executed:
        commands.append(_command_line(receipt["verification"]))
    artifact_paths = _artifact_paths(artifact_statuses)
    checksums = {
        _relative_or_absolute(path, context.repo_root): runner.sha256_file(path)
        for path in artifact_paths
        if path.is_file()
    }
    checksums[str(binding.path)] = binding.sha256
    verification_output: dict[str, Any] = {
        "materialization_schema": MATERIALIZATION_SCHEMA,
        "packet_execution_proven": True,
        "task_completion_proven": True,
        "implementation_scope": scope,
        "honesty_note": honesty_note,
        "needs_capability_probe": task.packet.get("needs_capability_probe") is True,
        "probe_class": task.packet.get("probe_class"),
        "packet_sha256": task.packet_sha256,
        "orchestration": {
            "run_id": context.run_id,
            "graph_sha256": context.graph_sha256,
        },
        "origin_receipt": {
            "run_id": receipt["run_id"],
            "graph_sha256": receipt["graph_sha256"],
            "attempt_id": receipt["attempt_id"],
            "path": str(binding.path),
            "sha256": binding.sha256,
        },
        "command_exit_code": receipt["command"]["exit_code"],
        "verification_executed": binding.verification_executed,
        "verification_exit_code": (
            receipt["verification"]["exit_code"]
            if binding.verification_executed
            else None
        ),
        "artifact_declarations": artifact_statuses,
    }
    if preserved_task_proof is not None:
        verification_output["preserved_task_proof"] = preserved_task_proof
    evidence = [
        _relative_or_absolute(path, context.repo_root)
        for path in artifact_paths
        if path.is_file()
    ]
    evidence.append(str(binding.path))
    if preserved_task_proof is not None:
        evidence.append(preserved_task_proof["path"])
    logs_path = Path(receipt["command"]["stdout"]["path"]).parent
    return {
        "proof_schema_version": "1.0",
        "task_id": task.task_id,
        "status": "completed",
        "started_at": receipt["started_at"],
        "completed_at": receipt["finished_at"],
        "actor": "json-task-runner",
        "helper_id": str(task.packet.get("helper_id", "")),
        "model_tag": str(task.packet.get("model_tag", "")),
        "repo_path": str(task.packet.get("repo_path", ".")),
        "files_changed": [
            _relative_or_absolute(path, context.repo_root)
            for path in artifact_paths
            if path.is_file()
        ],
        "commands_run": commands,
        "verification_output": verification_output,
        "checksums": checksums,
        "logs_uri": str(logs_path),
        "rollback_point": "history/pre_execution_framework_manifest.json",
        "evidence": evidence,
        "failure_reason": "",
        "next_action": next_action,
    }


def _ledger_key(record: dict[str, Any]) -> tuple[str, str, str, str] | None:
    output = record.get("verification_output")
    if not isinstance(output, dict):
        return None
    orchestration = output.get("orchestration")
    receipt = output.get("origin_receipt")
    if not isinstance(orchestration, dict) or not isinstance(receipt, dict):
        return None
    values = (
        record.get("task_id"),
        output.get("packet_sha256"),
        receipt.get("sha256"),
        orchestration.get("run_id"),
    )
    if not all(isinstance(value, str) and value for value in values):
        return None
    return values  # type: ignore[return-value]


def append_ledger_records(
    ledger_path: Path,
    records: Sequence[dict[str, Any]],
    write: bool,
) -> int:
    if not write:
        existing_keys: set[tuple[str, str, str, str]] = set()
        if ledger_path.is_file():
            for line_number, line in enumerate(
                ledger_path.read_text(encoding="utf-8").splitlines(),
                start=1,
            ):
                try:
                    value = json.loads(line)
                except json.JSONDecodeError as error:
                    raise MaterializationError(
                        f"invalid proof ledger JSON at {ledger_path}:{line_number}: {error}"
                    ) from error
                if isinstance(value, dict):
                    key = _ledger_key(value)
                    if key is not None:
                        existing_keys.add(key)
        return sum(
            1
            for record in records
            if _ledger_key(record) not in existing_keys
        )

    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = ledger_path.with_suffix(ledger_path.suffix + ".lock")
    with lock_path.open("a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        existing_keys: set[tuple[str, str, str, str]] = set()
        if ledger_path.is_file():
            for line_number, line in enumerate(
                ledger_path.read_text(encoding="utf-8").splitlines(),
                start=1,
            ):
                try:
                    value = json.loads(line)
                except json.JSONDecodeError as error:
                    raise MaterializationError(
                        f"invalid proof ledger JSON at "
                        f"{ledger_path}:{line_number}: {error}"
                    ) from error
                if not isinstance(value, dict):
                    raise MaterializationError(
                        f"proof ledger row is not an object at "
                        f"{ledger_path}:{line_number}"
                    )
                key = _ledger_key(value)
                if key is not None:
                    existing_keys.add(key)
        missing = [
            record
            for record in records
            if _ledger_key(record) not in existing_keys
        ]
        if missing:
            needs_newline = (
                ledger_path.is_file()
                and ledger_path.stat().st_size > 0
                and not ledger_path.read_bytes().endswith(b"\n")
            )
            with ledger_path.open("a", encoding="utf-8") as ledger:
                if needs_newline:
                    ledger.write("\n")
                for record in missing:
                    ledger.write(
                        json.dumps(
                            record,
                            sort_keys=False,
                            separators=(",", ":"),
                        )
                        + "\n"
                    )
                ledger.flush()
                os.fsync(ledger.fileno())
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
    return len(missing)


def _proof_required(task: runner.Task) -> bool:
    try:
        return runner.parse_bool(task.packet.get("proof_required"), False)
    except runner.RunnerError as error:
        raise MaterializationError(f"{task.task_id}: {error}") from error


def _verify_written_json(path: Path, expected: dict[str, Any]) -> None:
    observed = _load_json(path, "materialized JSON")
    if observed != expected:
        raise MaterializationError(f"materialized JSON does not match expected data: {path}")


def materialize_run(context: RunContext, write: bool) -> dict[str, Any]:
    proof_tasks = [
        task
        for task in sorted(context.tasks.values(), key=lambda item: item.task_id)
        if _proof_required(task)
    ]
    proof_records: list[dict[str, Any]] = []
    expected_proofs: list[tuple[Path, dict[str, Any]]] = []
    expected_results: list[tuple[Path, dict[str, Any]]] = []
    receipt_count = 0
    result_count = 0
    preserved_proof_count = 0
    preserved_artifact_count = 0
    descriptive_count = 0
    missing_files: list[dict[str, str]] = []

    for task in proof_tasks:
        binding = latest_receipt(context, task)
        receipt_count += 1
        proof_path = resolve_proof_path(context, task)
        preserved_proof = preserve_existing_proof(
            context,
            task,
            proof_path,
            write,
        )
        if preserved_proof is not None:
            preserved_proof_count += 1
        artifacts = classify_artifacts(context, task)
        result_paths = {
            artifact.path
            for artifact in artifacts
            if artifact.kind == "receipt_result" and artifact.path is not None
        }
        statuses = [
            _artifact_status(artifact, result_paths)
            for artifact in artifacts
        ]
        descriptive_count += sum(
            row["status"] == "descriptive_not_materialized"
            for row in statuses
        )
        for row in statuses:
            if row["status"] == "missing_declared_file":
                missing_files.append(
                    {
                        "task_id": task.task_id,
                        "declaration": row["declaration"],
                        "path": row["path"],
                    }
                )

        for result_path in sorted(result_paths):
            prior_digest, preserved_artifact = preserve_existing_artifact(
                context,
                task,
                result_path,
                write,
            )
            if preserved_artifact is not None:
                preserved_artifact_count += 1
            result = build_result(
                context,
                task,
                binding,
                result_path,
                statuses,
                prior_digest,
                preserved_artifact,
            )
            expected_results.append((result_path, result))
            result_count += 1
            if write:
                runner.atomic_write_json(result_path, result)

        # Result artifacts now exist, so bind their exact hashes into the proof.
        statuses = [
            _artifact_status(artifact, result_paths)
            for artifact in artifacts
        ]
        proof = build_proof(
            context,
            task,
            binding,
            statuses,
            preserved_proof,
        )
        proof_records.append(proof)
        expected_proofs.append((proof_path, proof))
        if write:
            runner.atomic_write_json(proof_path, proof)

    ledger_path = (
        context.execution_framework_root
        / "proof_records"
        / "proof_ledger.jsonl"
    )
    ledger_appended = append_ledger_records(ledger_path, proof_records, write)

    if write:
        for path, expected in expected_results:
            _verify_written_json(path, expected)
        for path, expected in expected_proofs:
            _verify_written_json(path, expected)

    report: dict[str, Any] = {
        "schema": REPORT_SCHEMA,
        "status": "passed" if not missing_files else "failed",
        "write_enabled": write,
        "run_id": context.run_id,
        "graph_sha256": context.graph_sha256,
        "graph_task_count": len(context.tasks),
        "proof_required_task_count": len(proof_tasks),
        "validated_receipt_count": receipt_count,
        "receipt_result_artifact_count": result_count,
        "proof_record_count": len(proof_records),
        "preserved_task_proof_count": preserved_proof_count,
        "preserved_artifact_count": preserved_artifact_count,
        "descriptive_artifact_declaration_count": descriptive_count,
        "missing_declared_files": missing_files,
        "ledger_records_appended": ledger_appended,
        "ledger_path": _relative_or_absolute(ledger_path, context.repo_root),
    }
    if write:
        report["ledger_sha256"] = runner.sha256_file(ledger_path)
        report_path = context.run_dir / "proof-materialization.json"
        runner.atomic_write_json(report_path, report)
        _verify_written_json(report_path, report)
        report["report_path"] = str(report_path)
    return report


def build_parser() -> argparse.ArgumentParser:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=repo_root,
    )
    parser.add_argument(
        "--receipts-dir",
        type=Path,
        default=repo_root / runner.DEFAULT_RECEIPTS_DIR,
    )
    parser.add_argument(
        "--execution-framework-root",
        type=Path,
        default=(
            repo_root
            / "planning-spine-v0"
            / "envctl-db-nu-plugin-migration-automation-package"
            / "execution-framework"
        ),
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write result artifacts, proofs, the ledger, and a run report.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    try:
        context = load_run_context(
            arguments.repo_root,
            arguments.receipts_dir,
            arguments.execution_framework_root,
            arguments.run_id,
        )
        report = materialize_run(context, arguments.write)
    except MaterializationError as error:
        print(f"materialize_runner_proofs: {error}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
