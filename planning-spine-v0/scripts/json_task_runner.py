#!/usr/bin/env python3
"""Execute repository JSON task packets as one dependency-aware task graph."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence


RUNNER_SCHEMA = "lifeos.json-task-runner.v1"
RECEIPT_SCHEMA = "lifeos.json-task-execution-receipt.v1"
RUN_SCHEMA = "lifeos.json-task-execution-run.v1"
DEFAULT_PACKET_ROOT = "planning-spine-v0"
DEFAULT_RECEIPTS_DIR = "planning-spine-v0/task_tables/execution_receipts"
DEFAULT_EXECUTOR = (
    "codex exec --sandbox danger-full-access --ignore-user-config --ignore-rules "
    "--ephemeral -c approval_policy=never -c project_doc_max_bytes=0 "
    "-c project_root_markers=[] --skip-git-repo-check "
    "--disable plugins --disable hooks --disable apps --disable multi_agent "
    "--disable goals --disable tool_suggest --disable skill_mcp_dependency_install -"
)
MODEL_ALIASES = {
    "sol": "gpt-5.6-sol",
    "terra": "gpt-5.6-terra",
    "luna": "gpt-5.6-luna",
    "spark": "gpt-5.3-codex-spark",
    "gpt-5.3-spark": "gpt-5.3-codex-spark",
}
MODEL_REASONING_EFFORT = {
    "gpt-5.6-sol": "high",
    "gpt-5.6-terra": "medium",
    "gpt-5.6-luna": "medium",
    "gpt-5.3-codex-spark": "high",
}
PACKET_PARENT_NAMES = {"execution_packets", "packets"}
DIRECT_SHELL_PREFIXES = {
    "bash",
    "bun",
    "bunx",
    "cargo",
    "command",
    "env",
    "git",
    "jq",
    "node",
    "npm",
    "npx",
    "python",
    "python3",
    "rtk",
    "sh",
    "test",
}
REPO_PATH_PLACEHOLDERS = {
    "${ENVCTL_REPO}": "src/envctl",
    "${NU_PLUGIN_REPO}": "src/nu_plugin",
}
NARRATIVE_GATE_WORDS = {
    "accepted",
    "covered",
    "documented",
    "passes",
    "ready",
    "succeeds",
    "tests",
    "validates",
    "works",
}
EXECUTOR_REFUSAL_PATTERNS = (
    re.compile(r"\bcannot execute\b", re.IGNORECASE),
    re.compile(r"\b[A-Z][A-Z0-9_-]{2,}\s+is blocked\b"),
    re.compile(
        r"^\s*execution (?:is|remains) blocked\b",
        re.IGNORECASE | re.MULTILINE,
    ),
    re.compile(r"\bexecution did not start\b", re.IGNORECASE),
    re.compile(r"\bblocked (?:before|from) execution\b", re.IGNORECASE),
    re.compile(r"\bcompletion gate (?:is|remains) unproven\b", re.IGNORECASE),
    re.compile(r"\bdependency gate is (?:blocking|failing)\b", re.IGNORECASE),
    re.compile(r"\bexecution status\b[^\n]{0,160}\bfailed\b", re.IGNORECASE),
    re.compile(r"\bresult:\s*\*{0,2}failed\b", re.IGNORECASE),
    re.compile(r"\bresult is therefore\b[^\n]{0,160}\bfailed\b", re.IGNORECASE),
    re.compile(r"\boverall\b[^\n]{0,160}\bremains failed\b", re.IGNORECASE),
    re.compile(r"\bfail-closed result\b", re.IGNORECASE),
    re.compile(r"\bfailed proof\b", re.IGNORECASE),
    re.compile(r"\bstatus\s*=\s*failed\b", re.IGNORECASE),
    re.compile(r"\bstatus:\s*blocked\b", re.IGNORECASE),
    re.compile(r"\bapproval\b[^\n]*\bis pending\b", re.IGNORECASE),
)
ACTIVE_PROCESSES: set[subprocess.Popen[bytes]] = set()
ACTIVE_PROCESSES_LOCK = threading.Lock()
AGENT_LAUNCH_LOCK = threading.Lock()
INTERRUPTED = threading.Event()
INSTRUCTION_NAMES = {
    ".agents",
    ".claude",
    ".codex",
    ".git",
    ".gitkb",
    ".gitnexus",
    ".kb",
    ".omc",
    ".ruvnet-brain",
    ".swarm",
    "AGENTS.md",
    "AGENTS.override.md",
    "CLAUDE.md",
}


class RunnerError(RuntimeError):
    """Invalid graph or runner configuration."""


@dataclass(frozen=True)
class Task:
    task_id: str
    packet_path: Path
    source_packet_path: Path
    packet_bytes: bytes
    packet: dict[str, Any]
    packet_sha256: str
    depends_on: tuple[str, ...]
    can_run_parallel: bool
    parallel_group: str
    max_parallel: int
    priority: int
    command_template: str | None
    verification_command: str | None
    command_cwd: Path
    workspace_root: Path


@dataclass(frozen=True)
class CommandResult:
    argv: tuple[str, ...]
    cwd: str
    exit_code: int
    timed_out: bool
    started_at: str
    finished_at: str
    duration_seconds: float
    stdout_path: str
    stdout_sha256: str
    stderr_path: str
    stderr_sha256: str


@dataclass(frozen=True)
class TaskResult:
    task_id: str
    status: str
    packet_sha256: str
    receipt_path: Path
    exit_code: int


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def compact_utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def prefixed_record_sha256(value: dict[str, Any], hash_field: str) -> str:
    hash_input = {key: item for key, item in value.items() if key != hash_field}
    return f"sha256:{sha256_bytes(canonical_json_bytes(hash_input))}"


def read_json_lines(path: Path) -> list[dict[str, Any]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise RunnerError(f"cannot read runtime ledger {path}: {error}") from error
    records = []
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise RunnerError(
                f"invalid JSON in runtime ledger {path}:{line_number}: {error}"
            ) from error
        if not isinstance(value, dict):
            raise RunnerError(
                f"runtime ledger record must be an object: {path}:{line_number}"
            )
        records.append(value)
    return records


def validate_record_chain(
    records: Sequence[dict[str, Any]],
    *,
    sequence_field: str,
    previous_field: str,
    hash_field: str,
    ledger_path: Path,
) -> None:
    previous: str | None = None
    for index, record in enumerate(records, start=1):
        if record.get(sequence_field) != index:
            raise RunnerError(
                f"invalid {sequence_field} at {ledger_path}:{index}"
            )
        if record.get(previous_field) != previous:
            raise RunnerError(
                f"invalid {previous_field} at {ledger_path}:{index}"
            )
        expected = prefixed_record_sha256(record, hash_field)
        if record.get(hash_field) != expected:
            raise RunnerError(f"invalid {hash_field} at {ledger_path}:{index}")
        previous = expected


def approval_required(task: Task) -> bool:
    approval = task.packet.get("approval")
    return isinstance(approval, dict) and approval.get("required") is True


def authorized_packet_input(
    task: Task,
    graph_digest: str,
    run_id: str,
    environment: dict[str, str],
) -> tuple[bytes, dict[str, Any] | None]:
    if not approval_required(task):
        return task.packet_bytes, None

    authorization_value = environment.get("LIFEOS_OWNER_AUTHORIZATION_PATH")
    approval_ledger_value = environment.get("LIFEOS_APPROVAL_LEDGER_PATH")
    checkpoint_ledger_value = environment.get("LIFEOS_CHECKPOINT_LEDGER_PATH")
    if not all(
        (authorization_value, approval_ledger_value, checkpoint_ledger_value)
    ):
        return task.packet_bytes, None

    authorization_path = Path(str(authorization_value)).resolve()
    approval_ledger_path = Path(str(approval_ledger_value)).resolve()
    checkpoint_ledger_path = Path(str(checkpoint_ledger_value)).resolve()
    try:
        authorization = json.loads(authorization_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RunnerError(
            f"invalid owner authorization record {authorization_path}: {error}"
        ) from error
    if not isinstance(authorization, dict):
        raise RunnerError("owner authorization record must be an object")
    authorization_hash = authorization.get("authorization_record_sha256")
    if authorization_hash != prefixed_record_sha256(
        authorization,
        "authorization_record_sha256",
    ):
        raise RunnerError("owner authorization record hash mismatch")
    if (
        authorization.get("schema")
        != "lifeos.digest-bound-owner-authorization.v1"
        or authorization.get("run_id") != run_id
        or authorization.get("graph_sha256") != graph_digest
        or authorization.get("status") != "approved"
        or authorization.get("decision") != "approved"
    ):
        raise RunnerError("owner authorization does not approve this immutable run")

    approval_records = read_json_lines(approval_ledger_path)
    validate_record_chain(
        approval_records,
        sequence_field="approval_seq",
        previous_field="previous_approval_hash",
        hash_field="approval_hash",
        ledger_path=approval_ledger_path,
    )
    packet_approval = task.packet["approval"]
    intent_lock = task.packet.get("intent_lock")
    intent_lock_digest = (
        intent_lock.get("digest") if isinstance(intent_lock, dict) else None
    )
    approval = next(
        (
            record
            for record in approval_records
            if record.get("task_id") == task.task_id
        ),
        None,
    )
    if (
        approval is None
        or approval.get("approval_id") != packet_approval.get("approval_id")
        or approval.get("status") != "approved"
        or approval.get("decision") != "approved"
        or approval.get("intent_lock_digest") != intent_lock_digest
        or approval.get("graph_sha256") != graph_digest
        or approval.get("authorization_record_sha256") != authorization_hash
    ):
        raise RunnerError(f"runtime approval mismatch for {task.task_id}")

    checkpoint_records = read_json_lines(checkpoint_ledger_path)
    validate_record_chain(
        checkpoint_records,
        sequence_field="checkpoint_seq",
        previous_field="previous_checkpoint_hash",
        hash_field="checkpoint_record_hash",
        ledger_path=checkpoint_ledger_path,
    )
    checkpoint_record = next(
        (
            record
            for record in reversed(checkpoint_records)
            if record.get("task_id") == task.task_id
        ),
        None,
    )
    if (
        checkpoint_record is None
        or checkpoint_record.get("status") != "recorded"
        or checkpoint_record.get("intent_lock_digest") != intent_lock_digest
    ):
        raise RunnerError(f"runtime checkpoint mismatch for {task.task_id}")

    checkpoint_ref = checkpoint_record.get("checkpoint_ref")
    checkpoint_hash = checkpoint_record.get("checkpoint_hash")
    if not isinstance(checkpoint_ref, str) or not isinstance(checkpoint_hash, str):
        raise RunnerError(f"invalid runtime checkpoint for {task.task_id}")
    task_table_root = authorization_path.parent.parent
    checkpoint_path = (task_table_root / checkpoint_ref).resolve()
    try:
        checkpoint_path.relative_to(task_table_root)
    except ValueError as error:
        raise RunnerError(
            f"runtime checkpoint escapes task table root: {checkpoint_ref}"
        ) from error
    try:
        checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RunnerError(
            f"invalid runtime checkpoint record {checkpoint_path}: {error}"
        ) from error
    if (
        not isinstance(checkpoint, dict)
        or checkpoint.get("checkpoint_sha256") != checkpoint_hash
        or checkpoint_hash
        != prefixed_record_sha256(checkpoint, "checkpoint_sha256")
        or checkpoint.get("task_id") != task.task_id
        or checkpoint.get("graph_sha256") != graph_digest
        or checkpoint.get("packet_sha256") != f"sha256:{task.packet_sha256}"
        or checkpoint.get("intent_lock_digest") != intent_lock_digest
    ):
        raise RunnerError(f"runtime checkpoint content mismatch for {task.task_id}")

    effective = json.loads(task.packet_bytes)
    effective["approval"] = {
        **effective["approval"],
        "status": "approved",
        "decision": "approved",
        "reviewer": approval.get("reviewer"),
        "decided_at": approval.get("decided_at"),
        "runtime_record_hash": approval.get("approval_hash"),
    }
    effective["checkpoint"] = {
        **effective["checkpoint"],
        "status": "recorded",
        "checkpoint_ref": checkpoint_ref,
        "checkpoint_hash": checkpoint_hash,
        "runtime_record_hash": checkpoint_record.get("checkpoint_record_hash"),
    }
    proof = effective.get("proof")
    if isinstance(proof, dict):
        effective["proof"] = {
            **proof,
            "status": "pending_execution",
            "required_after_execution": True,
        }
    replay = effective.get("replay")
    if isinstance(replay, dict) and authorization.get("scope", {}).get(
        "runtime_apply_allowed"
    ):
        effective["replay"] = {
            **replay,
            "apply_allowed": True,
            "dry_run_only": False,
            "runtime_authorization_id": authorization.get("authorization_id"),
        }
    effective["runtime_authorization"] = {
        "schema": "lifeos.runtime-task-authorization.v1",
        "run_id": run_id,
        "graph_sha256": graph_digest,
        "immutable_packet_sha256": task.packet_sha256,
        "authorization_id": authorization.get("authorization_id"),
        "authorization_record_sha256": authorization_hash,
        "approval_id": approval.get("approval_id"),
        "approval_hash": approval.get("approval_hash"),
        "checkpoint_id": checkpoint_record.get("checkpoint_id"),
        "checkpoint_record_hash": checkpoint_record.get(
            "checkpoint_record_hash"
        ),
        "owner_instruction": authorization.get("instruction"),
    }
    effective_bytes = json.dumps(
        effective,
        sort_keys=True,
        indent=2,
        ensure_ascii=False,
    ).encode("utf-8") + b"\n"
    evidence = {
        "status": "approved",
        "authorization_id": authorization.get("authorization_id"),
        "authorization_record_sha256": authorization_hash,
        "approval_id": approval.get("approval_id"),
        "approval_hash": approval.get("approval_hash"),
        "checkpoint_id": checkpoint_record.get("checkpoint_id"),
        "checkpoint_hash": checkpoint_hash,
        "checkpoint_record_hash": checkpoint_record.get(
            "checkpoint_record_hash"
        ),
        "execution_input_sha256": sha256_bytes(effective_bytes),
    }
    return effective_bytes, evidence


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def atomic_write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    temporary.write_bytes(value)
    os.replace(temporary, path)


def parse_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "1"}:
            return True
        if normalized in {"false", "no", "0", ""}:
            return False
    if value is None:
        return default
    raise RunnerError(f"expected boolean value, got {value!r}")


def parse_positive_int(value: Any, default: int) -> int:
    if value in {None, ""}:
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise RunnerError(f"expected integer value, got {value!r}") from error
    if parsed < 1:
        raise RunnerError(f"expected positive integer, got {parsed}")
    return parsed


def parse_dependencies(value: Any) -> tuple[str, ...]:
    if value is None or value == "":
        return ()
    if isinstance(value, str):
        parts = re.split(r"[|,\s]+", value)
        return tuple(dict.fromkeys(part for part in parts if part))
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return tuple(dict.fromkeys(item.strip() for item in value if item.strip()))
    raise RunnerError(f"depends_on must be a string or string array, got {value!r}")


def packet_execution(packet: dict[str, Any]) -> dict[str, Any]:
    nested = packet.get("execution")
    return nested if isinstance(nested, dict) else {}


def packet_field(packet: dict[str, Any], name: str, default: Any = None) -> Any:
    nested = packet_execution(packet)
    return packet.get(name, nested.get(name, default))


def command_root(packet_path: Path, repo_root: Path) -> Path:
    for parent in packet_path.parents:
        if parent.name == "execution-framework":
            return parent
    return repo_root


def meta_workspace_root(repo_root: Path) -> Path | None:
    for candidate in (repo_root, *repo_root.parents):
        if (candidate / ".meta").is_dir() or (candidate / ".meta.yaml").is_file():
            return candidate
    return None


def task_command_cwd(
    packet: dict[str, Any],
    packet_path: Path,
    repo_root: Path,
) -> Path:
    default = command_root(packet_path, repo_root)
    repo_path = packet.get("repo_path")
    if not isinstance(repo_path, str) or not repo_path:
        return default
    placeholder_path = REPO_PATH_PLACEHOLDERS.get(repo_path)
    if placeholder_path is not None:
        workspace_root = meta_workspace_root(repo_root)
        if workspace_root is None:
            return default
        candidate = (workspace_root / placeholder_path).resolve()
        return candidate if candidate.is_dir() else default
    if packet.get("schema") != "lifeos.execution-packet.v1":
        return repo_root if repo_path == "." else default
    if "${" in repo_path:
        return default
    declared = Path(repo_path)
    if declared.is_absolute():
        return declared.resolve() if declared.is_dir() else default

    workspace_root = meta_workspace_root(repo_root)
    roots = [repo_root]
    if workspace_root is not None and workspace_root != repo_root:
        if declared.parts and declared.parts[0] == "src":
            roots.insert(0, workspace_root)
        else:
            roots.append(workspace_root)
    for root in roots:
        candidate = (root / declared).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            continue
        if candidate.is_dir():
            return candidate
    return default


def is_task_packet(path: Path, packet_root: Path) -> bool:
    if path.suffix != ".json" or path.parent.name not in PACKET_PARENT_NAMES:
        return False
    if path.parent.name == "execution_packets":
        return True
    canonical_packets = packet_root / "task_tables" / "packets"
    try:
        return path.parent.resolve() == canonical_packets.resolve()
    except OSError:
        return False


def discover_packet_paths(packet_root: Path) -> list[Path]:
    if not packet_root.is_dir():
        raise RunnerError(f"packet root does not exist: {packet_root}")
    return sorted(
        path.resolve()
        for path in packet_root.rglob("*.json")
        if is_task_packet(path, packet_root)
    )


def load_task(path: Path, repo_root: Path) -> Task:
    packet_bytes = path.read_bytes()
    try:
        packet = json.loads(packet_bytes)
    except json.JSONDecodeError as error:
        raise RunnerError(f"{path}: invalid JSON: {error}") from error
    if not isinstance(packet, dict):
        raise RunnerError(f"{path}: packet must be a JSON object")

    task_id = packet.get("task_id")
    if not isinstance(task_id, str) or not task_id.strip():
        raise RunnerError(f"{path}: task_id must be non-empty text")
    task_id = task_id.strip()
    can_parallel = parse_bool(packet_field(packet, "can_run_parallel"), False)
    group = packet_field(packet, "parallel_group", "default")
    if not isinstance(group, str) or not group.strip():
        group = "default"
    priority_value = packet_field(packet, "priority", 1_000_000)
    try:
        priority = int(priority_value)
    except (TypeError, ValueError):
        priority = 1_000_000
    command = packet_field(packet, "command_template")
    verification = packet_field(packet, "verification_command")

    return Task(
        task_id=task_id,
        packet_path=path,
        source_packet_path=path,
        packet_bytes=packet_bytes,
        packet=packet,
        packet_sha256=sha256_bytes(packet_bytes),
        depends_on=parse_dependencies(packet.get("depends_on")),
        can_run_parallel=can_parallel,
        parallel_group=group.strip(),
        max_parallel=parse_positive_int(
            packet_field(packet, "max_parallel"),
            1 if not can_parallel else 4,
        ),
        priority=priority,
        command_template=command.strip() if isinstance(command, str) and command.strip() else None,
        verification_command=(
            verification.strip()
            if isinstance(verification, str) and verification.strip()
            else None
        ),
        command_cwd=task_command_cwd(packet, path, repo_root),
        workspace_root=repo_root,
    )


def load_tasks(packet_root: Path, repo_root: Path) -> dict[str, Task]:
    paths = discover_packet_paths(packet_root)
    if not paths:
        raise RunnerError(f"no JSON task packets found below {packet_root}")
    tasks: dict[str, Task] = {}
    for path in paths:
        task = load_task(path, repo_root)
        if task.task_id in tasks:
            previous = tasks[task.task_id].packet_path
            raise RunnerError(
                f"duplicate task_id {task.task_id}: {previous} and {task.packet_path}"
            )
        tasks[task.task_id] = task
    validate_graph(tasks)
    return tasks


def validate_graph(tasks: dict[str, Task]) -> None:
    missing = sorted(
        (task.task_id, dependency)
        for task in tasks.values()
        for dependency in task.depends_on
        if dependency not in tasks
    )
    if missing:
        details = ", ".join(f"{task}->{dependency}" for task, dependency in missing[:20])
        suffix = "" if len(missing) <= 20 else f" (+{len(missing) - 20} more)"
        raise RunnerError(f"missing dependencies: {details}{suffix}")

    indegree = {task_id: 0 for task_id in tasks}
    children = {task_id: [] for task_id in tasks}
    for task in tasks.values():
        indegree[task.task_id] = len(task.depends_on)
        for dependency in task.depends_on:
            children[dependency].append(task.task_id)
    ready = [task_id for task_id, count in indegree.items() if count == 0]
    visited = 0
    while ready:
        task_id = ready.pop()
        visited += 1
        for child in children[task_id]:
            indegree[child] -= 1
            if indegree[child] == 0:
                ready.append(child)
    if visited != len(tasks):
        cycle_nodes = sorted(task_id for task_id, count in indegree.items() if count)
        raise RunnerError(f"dependency cycle detected among: {', '.join(cycle_nodes[:20])}")


def graph_sha256(tasks: dict[str, Task]) -> str:
    rows = [
        {
            "task_id": task.task_id,
            "packet_sha256": task.packet_sha256,
            "depends_on": list(task.depends_on),
            "can_run_parallel": task.can_run_parallel,
            "parallel_group": task.parallel_group,
            "max_parallel": task.max_parallel,
            "priority": task.priority,
        }
        for task in sorted(tasks.values(), key=lambda item: item.task_id)
    ]
    canonical = json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()
    return sha256_bytes(canonical)


def snapshot_tasks(
    tasks: dict[str, Task],
    receipts_dir: Path,
    run_id: str,
) -> tuple[dict[str, Task], Path]:
    run_dir = receipts_dir / "runs" / run_id
    if run_dir.exists():
        raise RunnerError(f"run snapshot already exists: {run_dir}")
    packet_dir = run_dir / "packets"
    snapshotted: dict[str, Task] = {}
    manifest_tasks = []
    for task in sorted(tasks.values(), key=lambda item: item.task_id):
        snapshot_path = packet_dir / f"{task.task_id}.json"
        atomic_write_bytes(snapshot_path, task.packet_bytes)
        if sha256_file(snapshot_path) != task.packet_sha256:
            raise RunnerError(f"snapshot digest mismatch for {task.task_id}")
        snapshotted[task.task_id] = replace(
            task,
            packet_path=snapshot_path,
        )
        manifest_tasks.append(
            {
                "task_id": task.task_id,
                "snapshot_path": str(snapshot_path.relative_to(run_dir)),
                "source_packet_path": str(task.source_packet_path),
                "packet_sha256": task.packet_sha256,
                "command_cwd": str(task.command_cwd),
                "workspace_root": str(task.workspace_root),
            }
        )
    manifest = {
        "schema": f"{RUN_SCHEMA}.snapshot",
        "runner_schema": RUNNER_SCHEMA,
        "run_id": run_id,
        "created_at": utc_now(),
        "graph_sha256": graph_sha256(tasks),
        "task_count": len(tasks),
        "tasks": manifest_tasks,
    }
    atomic_write_json(run_dir / "graph.json", manifest)
    return snapshotted, run_dir


def load_snapshot(run_dir: Path, repo_root: Path) -> tuple[dict[str, Task], str]:
    run_dir = run_dir.resolve()
    manifest_path = run_dir / "graph.json"
    if not manifest_path.is_file():
        raise RunnerError(f"run snapshot manifest does not exist: {manifest_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RunnerError(f"invalid run snapshot manifest {manifest_path}: {error}") from error
    if manifest.get("schema") != f"{RUN_SCHEMA}.snapshot":
        raise RunnerError(f"unsupported run snapshot schema in {manifest_path}")
    rows = manifest.get("tasks")
    if not isinstance(rows, list):
        raise RunnerError(f"run snapshot tasks must be an array: {manifest_path}")

    tasks: dict[str, Task] = {}
    for row in rows:
        if not isinstance(row, dict):
            raise RunnerError(f"invalid run snapshot task row in {manifest_path}")
        relative = row.get("snapshot_path")
        if not isinstance(relative, str):
            raise RunnerError(f"snapshot_path is required in {manifest_path}")
        snapshot_path = (run_dir / relative).resolve()
        try:
            snapshot_path.relative_to(run_dir)
        except ValueError as error:
            raise RunnerError(f"snapshot path escapes run directory: {relative}") from error
        task = load_task(snapshot_path, repo_root)
        expected_id = row.get("task_id")
        expected_digest = row.get("packet_sha256")
        if task.task_id != expected_id or task.packet_sha256 != expected_digest:
            raise RunnerError(f"snapshot identity mismatch for {expected_id!r}")
        source_path = row.get("source_packet_path")
        command_cwd = row.get("command_cwd")
        workspace_root = row.get("workspace_root", str(repo_root))
        if (
            not isinstance(source_path, str)
            or not isinstance(command_cwd, str)
            or not isinstance(workspace_root, str)
        ):
            raise RunnerError(
                f"snapshot source path, command cwd, and workspace root are required "
                f"for {task.task_id}"
            )
        task = replace(
            task,
            source_packet_path=Path(source_path),
            workspace_root=Path(workspace_root),
        )
        repo_path = task.packet.get("repo_path")
        if (
            task.packet.get("schema") != "lifeos.execution-packet.v1"
            and repo_path not in REPO_PATH_PLACEHOLDERS
            and repo_path != "."
        ):
            task = replace(task, command_cwd=Path(command_cwd))
        if task.task_id in tasks:
            raise RunnerError(f"duplicate snapshot task_id {task.task_id}")
        tasks[task.task_id] = task
    validate_graph(tasks)
    observed_digest = graph_sha256(tasks)
    expected_graph_digest = manifest.get("graph_sha256")
    if observed_digest != expected_graph_digest:
        raise RunnerError(
            f"snapshot graph digest mismatch: expected {expected_graph_digest}, got {observed_digest}"
        )
    return tasks, str(manifest.get("run_id"))


def resumable_run_dir(receipts_dir: Path) -> Path | None:
    runs_dir = receipts_dir / "runs"
    if not runs_dir.is_dir():
        return None
    candidates = []
    for run_dir in runs_dir.iterdir():
        if not run_dir.is_dir() or not (run_dir / "graph.json").is_file():
            continue
        run_receipt = run_dir / "run.json"
        if not run_receipt.is_file():
            candidates.append(run_dir)
            continue
        try:
            value = json.loads(run_receipt.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            candidates.append(run_dir)
            continue
        counts = value.get("status_counts", {})
        if not isinstance(counts, dict) or counts.get("completed") != value.get("task_count"):
            candidates.append(run_dir)
    return max(candidates, default=None, key=lambda path: path.name)


def dependency_closure(tasks: dict[str, Task], selected: Sequence[str]) -> dict[str, Task]:
    if not selected:
        return tasks
    unknown = sorted(set(selected) - tasks.keys())
    if unknown:
        raise RunnerError(f"unknown task_id(s): {', '.join(unknown)}")
    included: set[str] = set()
    stack = list(selected)
    while stack:
        task_id = stack.pop()
        if task_id in included:
            continue
        included.add(task_id)
        stack.extend(tasks[task_id].depends_on)
    return {task_id: tasks[task_id] for task_id in included}


def receipt_files(receipts_dir: Path, task: Task) -> Iterable[Path]:
    directory = receipts_dir / task.task_id / task.packet_sha256
    return directory.glob("*.json") if directory.is_dir() else ()


def prior_status(receipts_dir: Path, task: Task) -> str:
    observed: list[tuple[str, str, dict[str, Any]]] = []
    for path in receipt_files(receipts_dir, task):
        try:
            receipt = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if (
            receipt.get("schema") != RECEIPT_SCHEMA
            or receipt.get("task_id") != task.task_id
            or receipt.get("packet_sha256") != task.packet_sha256
        ):
            continue
        observed.append(
            (
                str(receipt.get("finished_at", "")),
                path.name,
                receipt,
            )
        )
    if observed:
        latest = max(observed)[2]
        status = str(latest.get("status", ""))
        if latest.get("executor_refusal") or receipt_executor_refusal(latest):
            return "failed"
        if status == "completed" and approval_required(task):
            authorization = latest.get("authorization")
            if (
                not isinstance(authorization, dict)
                or authorization.get("status") != "approved"
                or not authorization.get("authorization_record_sha256")
                or latest.get("execution_input_sha256")
                != authorization.get("execution_input_sha256")
            ):
                return "failed"
        return status
    return "pending"


def dependency_consistent_statuses(
    tasks: dict[str, Task],
    statuses: dict[str, str],
) -> dict[str, str]:
    consistent = dict(statuses)
    changed = True
    while changed:
        changed = False
        for task_id, task in tasks.items():
            if consistent.get(task_id) != "completed":
                continue
            if any(
                consistent.get(dependency) != "completed"
                for dependency in task.depends_on
            ):
                consistent[task_id] = "pending"
                changed = True
    return consistent


def self_referential_codex_command(command: str) -> bool:
    return bool(re.search(r"(^|\s)codex\s+exec(?:\s|$)", command))


def looks_executable(command: str, cwd: Path | None = None) -> bool:
    try:
        words = shlex.split(command)
    except ValueError:
        return False
    if not words:
        return False
    normalized_words = {
        word.strip(".,:;()[]{}").lower()
        for word in words
    }
    if normalized_words & NARRATIVE_GATE_WORDS:
        return False
    first = words[0]
    if (
        re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", first)
        and any(operator in command for operator in (";", "&&", "||"))
    ):
        return True
    if first in DIRECT_SHELL_PREFIXES or shutil.which(first) is not None:
        return True
    if "/" not in first and not first.startswith("."):
        return False
    executable_path = Path(first).expanduser()
    if not executable_path.is_absolute() and cwd is not None:
        executable_path = cwd / executable_path
    return executable_path.is_file()


def prepare_codex_cell(task: Task, run_id: str, attempt_id: str) -> Path:
    runtime_root = Path(
        os.environ.get("XDG_RUNTIME_DIR", os.environ.get("TMPDIR", "/tmp"))
    )
    safe_task_id = re.sub(r"[^A-Za-z0-9_.-]", "_", task.task_id)
    cell = (
        runtime_root
        / "lifeos-json-task-runner"
        / run_id
        / safe_task_id
        / attempt_id
    )
    cell.mkdir(parents=True, exist_ok=False)

    for source_root in dict.fromkeys((task.command_cwd, task.workspace_root)):
        if not source_root.is_dir():
            continue
        for source in source_root.iterdir():
            if source.name in INSTRUCTION_NAMES:
                continue
            destination = cell / source.name
            if destination.exists() or destination.is_symlink():
                continue
            destination.symlink_to(source, target_is_directory=source.is_dir())

    task_root_link = cell / "__task_root__"
    task_root_link.symlink_to(task.command_cwd, target_is_directory=True)
    workspace_link = cell / "__workspace_root__"
    if task.workspace_root != task.command_cwd:
        workspace_link.symlink_to(task.workspace_root, target_is_directory=True)

    git_path = shutil.which("git")
    codex_path = shutil.which("codex")
    if git_path or codex_path:
        bin_dir = cell / ".lifeos-bin"
        bin_dir.mkdir()
    if git_path:
        wrapper = bin_dir / "git"
        wrapper.write_text(
            "#!/bin/sh\n"
            f"exec {shlex.quote(git_path)} -C "
            f"{shlex.quote(str(task.command_cwd))} \"$@\"\n",
            encoding="utf-8",
        )
        wrapper.chmod(0o700)
    if codex_path:
        wrapper = bin_dir / "codex"
        wrapper.write_text(
            "#!/bin/sh\n"
            "if [ \"${1:-}\" = \"exec\" ]; then\n"
            "  echo 'json-task-runner: nested codex exec is disabled; "
            "execute the current JSON packet directly' >&2\n"
            "  exit 126\n"
            "fi\n"
            f"exec {shlex.quote(codex_path)} \"$@\"\n",
            encoding="utf-8",
        )
        wrapper.chmod(0o700)
    return cell


def cargo_target_dir(task: Task, run_id: str) -> Path:
    # Build artifacts are DURABLE, not runtime state. XDG_RUNTIME_DIR is a RAM
    # tmpfs whose budget is shared with the wayland socket, dconf, dbus and
    # gnome-keyring, so a cargo target rooted there can starve the graphical
    # session outright -- on 2026-07-27 this directory alone held 20G while the
    # runtime tmpfs sat at 84% and the GNOME session had to be restarted.
    # prepare_codex_cell() still uses XDG_RUNTIME_DIR, correctly: a codex cell is
    # genuinely ephemeral and small. A cargo target is neither.
    # LIFEOS_TASK_CARGO_ROOT exists so tests and sandboxes can redirect this.
    runtime_root = Path(
        os.environ.get("LIFEOS_TASK_CARGO_ROOT")
        or Path.home() / "meta" / "var" / "cargo-target"
    )
    root_digest = sha256_bytes(
        str(task.command_cwd.resolve()).encode("utf-8")
    )[:16]
    safe_root_name = re.sub(
        r"[^A-Za-z0-9_.-]",
        "_",
        task.command_cwd.name or "repo",
    )
    return (
        runtime_root
        / "lifeos-json-task-cargo"
        / run_id
        / f"{safe_root_name}-{root_digest}"
    )


def task_model(task: Task) -> tuple[str, str]:
    declared = task.packet.get("model_tag")
    if isinstance(declared, str) and declared.strip():
        model = MODEL_ALIASES.get(declared.strip().lower(), declared.strip())
        return model, MODEL_REASONING_EFFORT.get(model, "medium")

    target_files = task.packet.get("target_files")
    targets = (
        [value for value in target_files if isinstance(value, str)]
        if isinstance(target_files, list)
        else []
    )
    execution = packet_execution(task.packet)
    routing_text = " ".join(
        str(value)
        for value in (
            task.task_id,
            task.packet.get("title", ""),
            task.packet.get("goal", ""),
            execution.get("completion_gate", ""),
            execution.get("verification_command", ""),
            *targets,
        )
    ).lower()

    build_manifest_target = any(
        Path(target).name in {"Cargo.toml", "Cargo.lock"} for target in targets
    )
    if build_manifest_target and any(
        marker in routing_text
        for marker in ("cargo metadata", "cargo check", "workspace compile", "workspace ready")
    ):
        return "gpt-5.3-codex-spark", "high"

    risk = str(task.packet.get("risk_level", "")).strip().lower()
    if risk in {"critical", "high", "r3"} or any(
        marker in routing_text
        for marker in ("architecture", "migration", "cutover", "security", "refactor")
    ):
        return "gpt-5.6-sol", "high"
    if risk in {"low", "r1"}:
        return "gpt-5.6-luna", "medium"

    document_suffixes = {".csv", ".json", ".md", ".yaml", ".yml"}
    if targets and all(Path(target).suffix.lower() in document_suffixes for target in targets):
        return "gpt-5.6-luna", "medium"
    return "gpt-5.6-terra", "medium"


def executor_model(executor: Sequence[str]) -> str | None:
    for index, argument in enumerate(executor):
        if argument in {"--model", "-m"} and index + 1 < len(executor):
            return executor[index + 1]
        if argument.startswith("--model="):
            return argument.partition("=")[2]
    return None


def codex_argv(executor: Sequence[str], cell: Path, task: Task) -> tuple[str, ...]:
    resolved_executor = tuple(executor)
    if executor and Path(executor[0]).name == "codex":
        codex_path = shutil.which(executor[0])
        if codex_path:
            resolved_executor = (codex_path, *executor[1:])
    selected_model, selected_effort = task_model(task)
    configured_model = executor_model(resolved_executor)
    additions: tuple[str, ...] = ()
    if configured_model is None:
        additions += ("--model", selected_model)
    else:
        selected_effort = MODEL_REASONING_EFFORT.get(
            MODEL_ALIASES.get(configured_model.lower(), configured_model),
            selected_effort,
        )
    if not any("model_reasoning_effort=" in argument for argument in resolved_executor):
        additions += ("-c", f"model_reasoning_effort={selected_effort}")
    additions += ("--cd", str(cell))
    if resolved_executor and resolved_executor[-1] == "-":
        return tuple(resolved_executor[:-1]) + additions + ("-",)
    return tuple(resolved_executor) + additions


def terminate_process_group(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=5)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def terminate_active_processes() -> None:
    with ACTIVE_PROCESSES_LOCK:
        processes = list(ACTIVE_PROCESSES)
    for process in processes:
        if process.poll() is not None:
            continue
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


def handle_interrupt(_signum: int, _frame: Any) -> None:
    terminate_active_processes()
    if not INTERRUPTED.is_set():
        INTERRUPTED.set()
        raise KeyboardInterrupt


def run_command(
    argv: Sequence[str],
    cwd: Path,
    stdin_bytes: bytes | None,
    stdout_path: Path,
    stderr_path: Path,
    timeout_seconds: float | None,
    environment: dict[str, str],
    serialize_launch: bool = False,
    launch_stagger_seconds: float = 0.0,
) -> CommandResult:
    stdout_path.parent.mkdir(parents=True, exist_ok=True)
    stderr_path.parent.mkdir(parents=True, exist_ok=True)
    started_at = utc_now()
    started = time.monotonic()
    timed_out = False
    exit_code = 127
    with stdout_path.open("wb") as stdout_handle, stderr_path.open("wb") as stderr_handle:
        launch_lock = AGENT_LAUNCH_LOCK if serialize_launch else threading.Lock()
        with launch_lock:
            try:
                process = subprocess.Popen(
                    list(argv),
                    cwd=cwd,
                    stdin=subprocess.PIPE if stdin_bytes is not None else subprocess.DEVNULL,
                    stdout=stdout_handle,
                    stderr=stderr_handle,
                    env=environment,
                    start_new_session=True,
                )
            except OSError as error:
                stderr_handle.write(f"failed to launch {argv[0]!r}: {error}\n".encode())
                process = None
            if process is not None:
                with ACTIVE_PROCESSES_LOCK:
                    ACTIVE_PROCESSES.add(process)
                if launch_stagger_seconds > 0:
                    time.sleep(launch_stagger_seconds)
        if process is not None:
            try:
                process.communicate(input=stdin_bytes, timeout=timeout_seconds)
            except subprocess.TimeoutExpired:
                timed_out = True
                terminate_process_group(process)
            finally:
                with ACTIVE_PROCESSES_LOCK:
                    ACTIVE_PROCESSES.discard(process)
            exit_code = 124 if timed_out else int(process.returncode)
    finished_at = utc_now()
    duration = time.monotonic() - started
    return CommandResult(
        argv=tuple(argv),
        cwd=str(cwd),
        exit_code=exit_code,
        timed_out=timed_out,
        started_at=started_at,
        finished_at=finished_at,
        duration_seconds=round(duration, 6),
        stdout_path=str(stdout_path),
        stdout_sha256=sha256_file(stdout_path),
        stderr_path=str(stderr_path),
        stderr_sha256=sha256_file(stderr_path),
    )


def command_result_json(result: CommandResult) -> dict[str, Any]:
    return {
        "argv": list(result.argv),
        "cwd": result.cwd,
        "exit_code": result.exit_code,
        "timed_out": result.timed_out,
        "started_at": result.started_at,
        "finished_at": result.finished_at,
        "duration_seconds": result.duration_seconds,
        "stdout": {
            "path": result.stdout_path,
            "sha256": result.stdout_sha256,
        },
        "stderr": {
            "path": result.stderr_path,
            "sha256": result.stderr_sha256,
        },
    }


def executor_refusal_text(text: str) -> str | None:
    for pattern in EXECUTOR_REFUSAL_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(0)
    lowered = text.lower()
    if (
        ("no files were modified" in lowered or "no files were changed" in lowered)
        and "approval" in lowered
        and ("pending" in lowered or "checkpoint" in lowered)
    ):
        return "executor reported no changes because approval/checkpoint was unresolved"
    return None


def receipt_executor_refusal(receipt: dict[str, Any]) -> str | None:
    command = receipt.get("command")
    if not isinstance(command, dict):
        return None
    stdout = command.get("stdout")
    if not isinstance(stdout, dict):
        return None
    path = stdout.get("path")
    if not isinstance(path, str) or not path:
        return None
    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    return executor_refusal_text(text)


def executor_refusal(result: CommandResult) -> str | None:
    try:
        text = Path(result.stdout_path).read_text(
            encoding="utf-8",
            errors="replace",
        )
    except OSError:
        text = ""
    return executor_refusal_text(text)


def execute_task(
    task: Task,
    executor: Sequence[str],
    receipts_dir: Path,
    run_id: str,
    graph_digest: str,
    timeout_seconds: float | None,
    print_lock: threading.Lock,
) -> TaskResult:
    attempt_id = f"{compact_utc_now()}-{uuid.uuid4().hex[:12]}"
    attempt_dir = receipts_dir / task.task_id / task.packet_sha256
    logs_dir = attempt_dir / "logs" / attempt_id
    environment = os.environ.copy()
    environment.update(
        {
            "CARGO_TARGET_DIR": str(cargo_target_dir(task, run_id)),
            "LIFEOS_TASK_ID": task.task_id,
            "LIFEOS_PACKET_PATH": str(task.packet_path),
            "LIFEOS_SOURCE_PACKET_PATH": str(task.source_packet_path),
            "LIFEOS_PACKET_SHA256": task.packet_sha256,
            "LIFEOS_TASK_RUN_ID": run_id,
            "LIFEOS_TASK_ROOT": str(task.command_cwd),
            "LIFEOS_WORKSPACE_ROOT": str(task.workspace_root),
        }
    )
    execution_input, authorization = authorized_packet_input(
        task,
        graph_digest,
        run_id,
        environment,
    )

    direct = bool(
        task.command_template
        and not self_referential_codex_command(task.command_template)
        and looks_executable(task.command_template, task.command_cwd)
    )
    if direct:
        argv = ("/bin/bash", "-lc", task.command_template or "")
        stdin_bytes = None
        cwd = task.command_cwd
        mode = "declared-command"
    else:
        is_codex = Path(executor[0]).name == "codex"
        if is_codex:
            cwd = prepare_codex_cell(task, run_id, attempt_id)
            argv = codex_argv(executor, cwd, task)
            bin_dir = cwd / ".lifeos-bin"
            if bin_dir.is_dir():
                environment["PATH"] = (
                    f"{bin_dir}{os.pathsep}{environment.get('PATH', '')}"
                )
        else:
            cwd = task.command_cwd if task.command_cwd.is_dir() else Path.cwd()
            argv = tuple(executor)
        stdin_bytes = execution_input
        mode = "json-stdin"

    with print_lock:
        print(
            f"START {task.task_id} {task.packet_sha256[:12]} "
            f"mode={mode} cwd={cwd}",
            flush=True,
        )
    main_result = run_command(
        argv,
        cwd,
        stdin_bytes,
        logs_dir / "stdout.log",
        logs_dir / "stderr.log",
        timeout_seconds,
        environment,
        serialize_launch=not direct and Path(executor[0]).name == "codex",
        launch_stagger_seconds=(
            2.0 if not direct and Path(executor[0]).name == "codex" else 0.0
        ),
    )

    refusal_reason = executor_refusal(main_result) if main_result.exit_code == 0 else None
    verification_result: CommandResult | None = None
    verification_cwd = (
        task.command_cwd if task.command_cwd.is_dir() else cwd
    )
    if (
        main_result.exit_code == 0
        and refusal_reason is None
        and task.verification_command
        and looks_executable(task.verification_command, verification_cwd)
    ):
        verification_result = run_command(
            ("/bin/bash", "-lc", task.verification_command),
            verification_cwd,
            None,
            logs_dir / "verification.stdout.log",
            logs_dir / "verification.stderr.log",
            timeout_seconds,
            environment,
        )

    if refusal_reason is not None:
        exit_code = 125
    else:
        exit_code = (
            verification_result.exit_code
            if verification_result is not None
            else main_result.exit_code
        )
    status = "completed" if exit_code == 0 else "failed"
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "runner_schema": RUNNER_SCHEMA,
        "run_id": run_id,
        "attempt_id": attempt_id,
        "task_id": task.task_id,
        "packet_path": str(task.packet_path),
        "source_packet_path": str(task.source_packet_path),
        "packet_sha256": task.packet_sha256,
        "graph_sha256": graph_digest,
        "task_root": str(task.command_cwd),
        "workspace_root": str(task.workspace_root),
        "cargo_target_dir": environment["CARGO_TARGET_DIR"],
        "depends_on": list(task.depends_on),
        "execution_mode": mode,
        "execution_input_sha256": sha256_bytes(execution_input),
        "authorization": authorization,
        "executor_refusal": refusal_reason,
        "started_at": main_result.started_at,
        "finished_at": (
            verification_result.finished_at
            if verification_result is not None
            else main_result.finished_at
        ),
        "status": status,
        "exit_code": exit_code,
        "command": command_result_json(main_result),
        "verification": (
            command_result_json(verification_result)
            if verification_result is not None
            else {
                "declared": task.verification_command,
                "executed": False,
                "reason": (
                    "not a shell command; verification remains inside the JSON task"
                    if task.verification_command
                    else "not declared"
                ),
            }
        ),
    }
    receipt_path = attempt_dir / f"{attempt_id}.json"
    atomic_write_json(receipt_path, receipt)
    with print_lock:
        print(
            f"{'DONE' if status == 'completed' else 'FAIL'} "
            f"{task.task_id} exit={exit_code} receipt={receipt_path}",
            flush=True,
        )
    return TaskResult(
        task_id=task.task_id,
        status=status,
        packet_sha256=task.packet_sha256,
        receipt_path=receipt_path,
        exit_code=exit_code,
    )


def task_sort_key(task: Task) -> tuple[int, str]:
    return task.priority, task.task_id


def select_batch(ready: Sequence[Task], global_limit: int) -> list[Task]:
    ordered = sorted(ready, key=task_sort_key)
    if not ordered:
        return []
    if not ordered[0].can_run_parallel:
        return [ordered[0]]
    batch: list[Task] = []
    group_counts: dict[str, int] = {}
    group_limits: dict[str, int] = {}
    for task in ordered:
        if not task.can_run_parallel or len(batch) >= global_limit:
            continue
        current_limit = group_limits.get(task.parallel_group, task.max_parallel)
        current_limit = min(current_limit, task.max_parallel)
        group_limits[task.parallel_group] = current_limit
        current_count = group_counts.get(task.parallel_group, 0)
        if current_count >= current_limit:
            continue
        batch.append(task)
        group_counts[task.parallel_group] = current_count + 1
    return batch


def schedule_waves(tasks: dict[str, Task], global_limit: int) -> list[list[str]]:
    completed: set[str] = set()
    pending = set(tasks)
    waves: list[list[str]] = []
    while pending:
        ready = [
            tasks[task_id]
            for task_id in pending
            if set(tasks[task_id].depends_on) <= completed
        ]
        batch = select_batch(ready, global_limit)
        if not batch:
            raise RunnerError("scheduler deadlock after graph validation")
        task_ids = [task.task_id for task in batch]
        waves.append(task_ids)
        completed.update(task_ids)
        pending.difference_update(task_ids)
    return waves


def print_table(tasks: dict[str, Task], statuses: dict[str, str]) -> None:
    headers = ("TASK", "STATUS", "MODE", "GROUP", "LIMIT", "DEPENDENCIES", "SHA256")
    rows = []
    for task in sorted(tasks.values(), key=task_sort_key):
        rows.append(
            (
                task.task_id,
                statuses.get(task.task_id, "pending"),
                "parallel" if task.can_run_parallel else "sequential",
                task.parallel_group,
                str(task.max_parallel),
                ",".join(task.depends_on) or "-",
                task.packet_sha256[:12],
            )
        )
    widths = [
        max(len(headers[index]), *(len(row[index]) for row in rows))
        for index in range(len(headers))
    ]
    print("  ".join(value.ljust(widths[index]) for index, value in enumerate(headers)))
    for row in rows:
        print("  ".join(value.ljust(widths[index]) for index, value in enumerate(row)))


def run_tasks(
    tasks: dict[str, Task],
    executor: Sequence[str],
    receipts_dir: Path,
    max_parallel: int,
    timeout_seconds: float | None,
    retry_failed: bool,
    fail_fast: bool,
    run_id: str | None = None,
    create_snapshot: bool = True,
) -> tuple[int, dict[str, str], Path]:
    run_id = run_id or f"{compact_utc_now()}-{uuid.uuid4().hex[:12]}"
    if create_snapshot:
        tasks, run_dir = snapshot_tasks(tasks, receipts_dir, run_id)
    else:
        run_dir = receipts_dir / "runs" / run_id
        if not (run_dir / "graph.json").is_file():
            raise RunnerError(f"cannot resume missing run snapshot: {run_dir}")
    run_started_at = utc_now()
    graph_digest = graph_sha256(tasks)
    statuses = dependency_consistent_statuses(
        tasks,
        {
            task_id: prior_status(receipts_dir, task)
            for task_id, task in tasks.items()
        },
    )
    if retry_failed:
        statuses = {
            task_id: "pending" if status == "failed" else status
            for task_id, status in statuses.items()
        }
    completed = {task_id for task_id, status in statuses.items() if status == "completed"}
    failed = {task_id for task_id, status in statuses.items() if status == "failed"}
    pending = set(tasks) - completed - failed
    attempts: list[dict[str, Any]] = []
    print_lock = threading.Lock()

    while pending:
        ready = [
            tasks[task_id]
            for task_id in pending
            if set(tasks[task_id].depends_on) <= completed
        ]
        batch = select_batch(ready, max_parallel)
        if not batch:
            break
        with ThreadPoolExecutor(max_workers=len(batch)) as pool:
            futures = {
                pool.submit(
                    execute_task,
                    task,
                    executor,
                    receipts_dir,
                    run_id,
                    graph_digest,
                    timeout_seconds,
                    print_lock,
                ): task
                for task in batch
            }
            for future in as_completed(futures):
                result = future.result()
                attempts.append(
                    {
                        "task_id": result.task_id,
                        "status": result.status,
                        "packet_sha256": result.packet_sha256,
                        "receipt_path": str(result.receipt_path),
                        "exit_code": result.exit_code,
                    }
                )
                statuses[result.task_id] = result.status
                pending.remove(result.task_id)
                if result.status == "completed":
                    completed.add(result.task_id)
                else:
                    failed.add(result.task_id)
        if fail_fast and failed:
            break

    blocked: set[str] = set()
    changed = True
    while changed:
        changed = False
        for task_id in pending - blocked:
            dependencies = set(tasks[task_id].depends_on)
            if dependencies & (failed | blocked):
                blocked.add(task_id)
                changed = True
    for task_id in sorted(pending):
        statuses[task_id] = "blocked" if task_id in blocked or fail_fast else "pending"

    run_receipt = {
        "schema": RUN_SCHEMA,
        "runner_schema": RUNNER_SCHEMA,
        "run_id": run_id,
        "started_at": run_started_at,
        "finished_at": utc_now(),
        "graph_sha256": graph_digest,
        "task_count": len(tasks),
        "max_parallel": max_parallel,
        "executor": list(executor),
        "status_counts": {
            status: sum(1 for observed in statuses.values() if observed == status)
            for status in ("completed", "failed", "blocked", "pending")
        },
        "tasks": [
            {
                "task_id": task.task_id,
                "packet_path": str(task.packet_path),
                "source_packet_path": str(task.source_packet_path),
                "packet_sha256": task.packet_sha256,
                "depends_on": list(task.depends_on),
                "status": statuses[task.task_id],
            }
            for task in sorted(tasks.values(), key=task_sort_key)
        ],
        "attempts": attempts,
    }
    run_path = run_dir / "run.json"
    atomic_write_json(run_path, run_receipt)
    exit_code = 0 if all(status == "completed" for status in statuses.values()) else 1
    return exit_code, statuses, run_path


def build_parser(repo_root: Path) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Load JSON task packets into one validated DAG, execute ready tasks, "
            "and write SHA-256-bound receipts."
        )
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=repo_root,
        help="Repository root used as the default task working directory",
    )
    parser.add_argument(
        "--packet-root",
        type=Path,
        default=repo_root / DEFAULT_PACKET_ROOT,
        help="Root containing task_tables/packets and **/execution_packets",
    )
    parser.add_argument(
        "--receipts-dir",
        type=Path,
        default=repo_root / DEFAULT_RECEIPTS_DIR,
        help="Immutable receipt and log directory",
    )
    parser.add_argument(
        "--executor",
        default=os.environ.get("LIFEOS_JSON_TASK_EXECUTOR", DEFAULT_EXECUTOR),
        help="Command that consumes exact packet JSON on stdin",
    )
    parser.add_argument(
        "--max-parallel",
        type=int,
        default=4,
        help="Global bounded-concurrency limit",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=None,
        help="Per command timeout; omitted means no timeout",
    )
    parser.add_argument(
        "--task",
        action="append",
        default=[],
        help="Execute one task and its dependency closure; repeatable",
    )
    parser.add_argument(
        "--retry-failed",
        action="store_true",
        help="Retry matching-digest tasks with previous failed receipts",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="Stop dispatching after the first failed batch",
    )
    resume = parser.add_mutually_exclusive_group()
    resume.add_argument(
        "--resume-run",
        help="Resume an immutable run snapshot by run ID or directory",
    )
    resume.add_argument(
        "--new-run",
        action="store_true",
        help="Ignore resumable snapshots and capture the current packet files as a new run",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate and report the unified graph without executing",
    )
    mode.add_argument(
        "--plan",
        action="store_true",
        help="Print deterministic execution waves without executing",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    signal.signal(signal.SIGINT, handle_interrupt)
    signal.signal(signal.SIGTERM, handle_interrupt)
    inferred_repo_root = Path(__file__).resolve().parents[2]
    parser = build_parser(inferred_repo_root)
    args = parser.parse_args(argv)
    if args.max_parallel < 1:
        parser.error("--max-parallel must be at least 1")
    if args.timeout_seconds is not None and args.timeout_seconds <= 0:
        parser.error("--timeout-seconds must be positive")
    try:
        repo_root = args.repo_root.resolve()
        packet_root = args.packet_root.resolve()
        receipts_dir = args.receipts_dir.resolve()
        resume_dir: Path | None = None
        if args.resume_run:
            candidate = Path(args.resume_run)
            resume_dir = (
                candidate.resolve()
                if candidate.is_absolute() or len(candidate.parts) > 1
                else (receipts_dir / "runs" / candidate).resolve()
            )
        elif not args.new_run and not args.validate_only and not args.plan and not args.task:
            resume_dir = resumable_run_dir(receipts_dir)

        if resume_dir is not None:
            if args.task:
                raise RunnerError("--task cannot be combined with a resumed run snapshot")
            tasks, resume_run_id = load_snapshot(resume_dir, repo_root)
            input_description = f"immutable run snapshot {resume_dir}"
        else:
            tasks = load_tasks(packet_root, repo_root)
            tasks = dependency_closure(tasks, args.task)
            resume_run_id = None
            input_description = str(packet_root)
        graph_digest = graph_sha256(tasks)
        statuses = dependency_consistent_statuses(
            tasks,
            {
                task_id: prior_status(receipts_dir, task)
                for task_id, task in tasks.items()
            },
        )
        print(
            f"Loaded {len(tasks)} JSON tasks into one graph "
            f"sha256={graph_digest} from {input_description}"
        )
        if args.validate_only:
            print_table(tasks, statuses)
            return 0
        if args.plan:
            waves = schedule_waves(tasks, args.max_parallel)
            for index, wave in enumerate(waves, start=1):
                print(f"WAVE {index}: {' '.join(wave)}")
            return 0
        executor = tuple(shlex.split(args.executor))
        if not executor:
            raise RunnerError("--executor must not be empty")
        exit_code, statuses, run_path = run_tasks(
            tasks,
            executor,
            receipts_dir,
            args.max_parallel,
            args.timeout_seconds,
            args.retry_failed,
            args.fail_fast,
            run_id=resume_run_id,
            create_snapshot=resume_dir is None,
        )
        print_table(tasks, statuses)
        print(f"RUN RECEIPT {run_path}")
        return exit_code
    except RunnerError as error:
        print(f"json-task-runner: {error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        terminate_active_processes()
        print("json-task-runner: interrupted; active task processes terminated", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
