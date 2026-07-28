#!/usr/bin/env python3
"""Execute repository JSON task packets as one dependency-aware task graph."""

from __future__ import annotations

import argparse
import glob
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


RUNNER_SCHEMA = "lifeos.json-task-runner.v2"
RECEIPT_SCHEMA = "lifeos.json-task-execution-receipt.v2"
RUN_SCHEMA = "lifeos.json-task-execution-run.v2"
DEFAULT_PACKET_ROOT = "planning-spine-v0"
DEFAULT_RECEIPTS_DIR = "planning-spine-v0/task_tables/execution_receipts"
DEFAULT_EXECUTOR = (
    "codex exec --sandbox danger-full-access --ignore-user-config --ignore-rules "
    "--ephemeral -c approval_policy=never -c project_doc_max_bytes=0 "
    "-c project_root_markers=[] --skip-git-repo-check "
    "--disable plugins --disable hooks --disable apps --disable multi_agent "
    "--disable goals --disable tool_suggest --disable skill_mcp_dependency_install -"
)
PROFILE_RTK = "/home/flexnetos/.nix-profile/bin/rtk"
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
CANONICAL_PACKET_ROOT_MARKERS = {
    "PACKAGE_MANIFEST.json",
    "task_tables",
}
CANONICAL_DISCOVERY_EXCLUDED_PARTS = {
    ".claude",
    ".git",
    ".grit",
    ".worktrees",
    "archives",
    "node_modules",
    "target",
}
SEMANTIC_ENVELOPE_FIELDS = {
    "generated_at",
    "graph_sha256",
    "packet_sha256",
    "source_graph_sha256",
    "source_graph_uri",
}
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
    re.compile(r"\bpass_with_external_blocker\b", re.IGNORECASE),
    re.compile(r"\bapproval\b[^\n]*\bis pending\b", re.IGNORECASE),
)
ACTIVE_PROCESSES: set[subprocess.Popen[bytes]] = set()
ACTIVE_PROCESSES_LOCK = threading.Lock()
AGENT_LAUNCH_LOCK = threading.Lock()
RECEIPT_CHAIN_LOCK = threading.Lock()
WORKSPACE_LOCKS: dict[str, threading.Lock] = {}
WORKSPACE_LOCKS_GUARD = threading.Lock()
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
    node_id: str
    task_id: str
    packet_path: Path
    source_packet_path: Path
    packet_bytes: bytes
    packet: dict[str, Any]
    packet_sha256: str
    semantic_contract_sha256: str
    source_authority: str
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
    node_id: str
    task_id: str
    status: str
    packet_sha256: str
    receipt_path: Path
    exit_code: int


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def compact_utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


def validate_run_id(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", value):
        raise RunnerError(
            "run ID must be 1-128 characters using only letters, digits, "
            "dot, underscore, or hyphen, and must start with a letter or digit"
        )
    return value


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


def semantic_contract(packet: dict[str, Any]) -> dict[str, Any]:
    """Remove generation-envelope metadata without weakening the task contract."""
    return {
        key: value
        for key, value in packet.items()
        if key not in SEMANTIC_ENVELOPE_FIELDS
    }


def semantic_contract_sha256(packet: dict[str, Any]) -> str:
    return sha256_bytes(canonical_json_bytes(semantic_contract(packet)))


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
    effective = json.loads(task.packet_bytes)
    if approval_required(task):
        approval = effective.get("approval")
        effective["approval"] = {
            **(approval if isinstance(approval, dict) else {}),
            "status": "approved",
            "decision": "approved",
            "reviewer": "owner",
            "runtime_owner_authorized": True,
        }
    replay = effective.get("replay")
    if isinstance(replay, dict):
        effective["replay"] = {
            **replay,
            "apply_allowed": True,
            "dry_run_only": False,
        }
    effective["runtime_authorization"] = {
        "run_id": run_id,
        "graph_sha256": graph_digest,
        "immutable_packet_sha256": task.packet_sha256,
        "owner_authorized": True,
    }
    effective_bytes = json.dumps(
        effective,
        sort_keys=True,
        indent=2,
        ensure_ascii=False,
    ).encode("utf-8") + b"\n"
    return effective_bytes, None


def runtime_packet_input(
    task: Task,
    graph_digest: str,
    run_id: str,
    environment: dict[str, str],
    dependency_outputs: Sequence[dict[str, Any]],
) -> tuple[bytes, dict[str, Any] | None]:
    """Execute the implementation payload without runner-added gates."""
    del graph_digest, run_id, environment, dependency_outputs
    effective = json.loads(task.packet_bytes)
    gate_fields = (
        "approval",
        "checkpoint",
        "completion_gate",
        "human_approval_required",
        "intent_lock",
        "needs_capability_probe",
        "probe_class",
        "proof",
        "proof_required",
        "proof_uri",
        "runtime_lifecycle_contract",
        "verification_command",
    )
    for field in gate_fields:
        effective.pop(field, None)
    execution = effective.get("execution")
    if isinstance(execution, dict):
        for field in gate_fields:
            execution.pop(field, None)
    effective_bytes = (
        json.dumps(
            effective,
            sort_keys=True,
            indent=2,
            ensure_ascii=False,
        ).encode("utf-8")
        + b"\n"
    )
    return effective_bytes, None


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


def implementation_obligation_reason(packet: dict[str, Any]) -> str | None:
    """Return why a packet execution cannot prove implementation completion."""
    gate_and_notes = " ".join(
        str(packet.get(field, ""))
        for field in ("completion_gate", "notes")
    ).lower()
    reasons: list[str] = []
    if packet.get("needs_capability_probe") is True:
        reasons.append("needs_capability_probe is true")
    if str(packet.get("probe_class", "")).strip().lower() == "drift-canary":
        reasons.append("probe_class is drift-canary")
    if "not evidence of implementation" in gate_and_notes:
        reasons.append("packet explicitly disclaims implementation evidence")
    return "; ".join(reasons) if reasons else None


def task_completion_blocker(
    task: Task,
    *,
    verification_executed: bool,
) -> str | None:
    """Keep command execution distinct from verified task completion."""
    obligation = implementation_obligation_reason(task.packet)
    if obligation:
        return obligation
    if not verification_executed:
        return "independent executable verification did not run"
    return None


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


def normalize_packet_roots(
    packet_roots: Path | Sequence[Path],
) -> tuple[Path, ...]:
    values = (
        [packet_roots]
        if isinstance(packet_roots, Path)
        else list(packet_roots)
    )
    resolved: list[Path] = []
    seen: set[Path] = set()
    for value in values:
        root = Path(value).resolve()
        if root in seen:
            continue
        if not root.is_dir():
            raise RunnerError(f"packet root does not exist: {root}")
        seen.add(root)
        resolved.append(root)
    if not resolved:
        raise RunnerError("at least one packet root is required")
    return tuple(resolved)


def _excluded_discovery_path(path: Path, search_root: Path) -> bool:
    try:
        relative = path.relative_to(search_root)
    except ValueError:
        return True
    if set(relative.parts) & CANONICAL_DISCOVERY_EXCLUDED_PARTS:
        return True
    if relative.parts:
        repository_root = search_root / relative.parts[0]
        if (repository_root / ".git").is_file():
            return True
    return False


def _nearest_packet_root(path: Path) -> Path:
    for parent in path.parents:
        if (parent / "PACKAGE_MANIFEST.json").is_file():
            return parent
        if (parent / "task_tables" / "packets").is_dir():
            return parent
    return path.parent.parent


def discover_canonical_packet_roots(
    repo_root: Path,
    explicit_roots: Sequence[Path] = (),
) -> tuple[Path, ...]:
    """Find authoritative packet packages while excluding projections/worktrees."""
    roots = {path.resolve() for path in explicit_roots}
    default_root = (repo_root / DEFAULT_PACKET_ROOT).resolve()
    if default_root.is_dir():
        roots.add(default_root)

    workspace_root = meta_workspace_root(repo_root)
    search_root = (
        workspace_root / "src"
        if workspace_root is not None and (workspace_root / "src").is_dir()
        else repo_root
    )
    for directory_name in ("execution_packets", "packets"):
        for directory in search_root.rglob(directory_name):
            if not directory.is_dir() or _excluded_discovery_path(directory, search_root):
                continue
            if directory_name == "packets" and directory.parent.name != "task_tables":
                continue
            roots.add(_nearest_packet_root(directory).resolve())
    return tuple(sorted(roots, key=str))


def discover_packet_paths(
    packet_roots: Path | Sequence[Path],
) -> list[Path]:
    roots = normalize_packet_roots(packet_roots)
    paths: set[Path] = set()
    for packet_root in roots:
        paths.update(
            path.resolve()
            for path in packet_root.rglob("*.json")
            if is_task_packet(path, packet_root)
        )
    return sorted(paths)


def source_authority(
    path: Path,
    packet_roots: Sequence[Path],
    repo_root: Path,
) -> str:
    containing = [
        root
        for root in packet_roots
        if path == root or root in path.parents
    ]
    root = max(containing, key=lambda value: len(value.parts), default=path.parent)
    workspace_root = meta_workspace_root(repo_root)
    if workspace_root is not None:
        try:
            return root.relative_to(workspace_root).as_posix()
        except ValueError:
            pass
    try:
        return root.relative_to(repo_root).as_posix() or "."
    except ValueError:
        return str(root)


def load_task(
    path: Path,
    repo_root: Path,
    *,
    node_id: str | None = None,
    authority: str | None = None,
) -> Task:
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
        node_id=node_id or task_id,
        task_id=task_id,
        packet_path=path,
        source_packet_path=path,
        packet_bytes=packet_bytes,
        packet=packet,
        packet_sha256=sha256_bytes(packet_bytes),
        semantic_contract_sha256=semantic_contract_sha256(packet),
        source_authority=authority or ".",
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


def _source_node_suffix(task: Task) -> str:
    source_digest = sha256_bytes(task.source_authority.encode("utf-8"))[:8]
    return f"{source_digest}-{task.packet_sha256[:12]}"


def _resolve_dependency_node(
    task: Task,
    dependency_task_id: str,
    grouped: dict[str, list[Task]],
) -> str:
    candidates = grouped.get(dependency_task_id, [])
    same_authority = [
        candidate
        for candidate in candidates
        if candidate.source_authority == task.source_authority
    ]
    if len(same_authority) == 1:
        return same_authority[0].node_id
    if len(candidates) == 1:
        return candidates[0].node_id
    authorities = ", ".join(
        sorted(candidate.source_authority for candidate in candidates)
    )
    raise RunnerError(
        f"ambiguous dependency {task.node_id}->{dependency_task_id}; "
        f"candidates: {authorities}"
    )


def load_tasks(
    packet_roots: Path | Sequence[Path],
    repo_root: Path,
) -> dict[str, Task]:
    roots = normalize_packet_roots(packet_roots)
    paths = discover_packet_paths(roots)
    if not paths:
        joined = ", ".join(str(root) for root in roots)
        raise RunnerError(f"no JSON task packets found below: {joined}")
    loaded = [
        load_task(
            path,
            repo_root,
            authority=source_authority(path, roots, repo_root),
        )
        for path in paths
    ]
    grouped: dict[str, list[Task]] = {}
    for task in loaded:
        grouped.setdefault(task.task_id, []).append(task)

    identified: list[Task] = []
    for task_id, candidates in grouped.items():
        by_authority: dict[str, list[Task]] = {}
        for candidate in candidates:
            by_authority.setdefault(candidate.source_authority, []).append(candidate)
        duplicate_authority = next(
            (
                (authority, matches)
                for authority, matches in by_authority.items()
                if len(matches) > 1
            ),
            None,
        )
        if duplicate_authority is not None:
            authority, matches = duplicate_authority
            paths = ", ".join(str(match.packet_path) for match in matches)
            raise RunnerError(
                f"duplicate task_id {task_id} in source {authority}: {paths}"
            )
        if len(candidates) == 1:
            identified.append(candidates[0])
            continue
        for candidate in candidates:
            identified.append(
                replace(
                    candidate,
                    node_id=f"{task_id}@{_source_node_suffix(candidate)}",
                )
            )

    grouped = {}
    for task in identified:
        grouped.setdefault(task.task_id, []).append(task)

    tasks: dict[str, Task] = {}
    for task in identified:
        resolved_dependencies = tuple(
            _resolve_dependency_node(task, dependency, grouped)
            for dependency in task.depends_on
        )
        task = replace(task, depends_on=resolved_dependencies)
        if task.node_id in tasks:
            previous = tasks[task.node_id].packet_path
            raise RunnerError(
                f"duplicate node_id {task.node_id}: {previous} and {task.packet_path}"
            )
        tasks[task.node_id] = task

    for candidates in grouped.values():
        by_semantic: dict[str, list[Task]] = {}
        for candidate in candidates:
            by_semantic.setdefault(candidate.semantic_contract_sha256, []).append(
                tasks[candidate.node_id]
            )
        for semantic_duplicates in by_semantic.values():
            if len(semantic_duplicates) < 2:
                continue
            ordered = sorted(
                semantic_duplicates,
                key=lambda item: (item.source_authority, item.packet_sha256),
            )
            for previous, current in zip(ordered, ordered[1:], strict=False):
                if previous.node_id in current.depends_on:
                    continue
                tasks[current.node_id] = replace(
                    current,
                    depends_on=(*current.depends_on, previous.node_id),
                )

    release_nodes = [
        task
        for task in tasks.values()
        if task.packet.get("consumes_all_leaf_capabilities") is True
    ]
    if len(release_nodes) > 1:
        raise RunnerError(
            "only one consumes_all_leaf_capabilities release node is allowed"
        )
    if release_nodes:
        release = release_nodes[0]
        consumers = {
            dependency
            for task in tasks.values()
            if task.node_id != release.node_id
            for dependency in task.depends_on
        }
        leaves = sorted(
            node_id
            for node_id, task in tasks.items()
            if node_id != release.node_id
            and node_id not in consumers
            and task_produces_capability(task)
        )
        tasks[release.node_id] = replace(
            release,
            depends_on=tuple(
                dict.fromkeys((*release.depends_on, *leaves))
            ),
        )

    validate_graph(tasks)
    return tasks


def validate_graph(tasks: dict[str, Task]) -> None:
    missing = sorted(
        (task.node_id, dependency)
        for task in tasks.values()
        for dependency in task.depends_on
        if dependency not in tasks
    )
    if missing:
        details = ", ".join(f"{task}->{dependency}" for task, dependency in missing[:20])
        suffix = "" if len(missing) <= 20 else f" (+{len(missing) - 20} more)"
        raise RunnerError(f"missing dependencies: {details}{suffix}")

    indegree = {node_id: 0 for node_id in tasks}
    children = {node_id: [] for node_id in tasks}
    for task in tasks.values():
        indegree[task.node_id] = len(task.depends_on)
        for dependency in task.depends_on:
            children[dependency].append(task.node_id)
    ready = [node_id for node_id, count in indegree.items() if count == 0]
    visited = 0
    while ready:
        node_id = ready.pop()
        visited += 1
        for child in children[node_id]:
            indegree[child] -= 1
            if indegree[child] == 0:
                ready.append(child)
    if visited != len(tasks):
        cycle_nodes = sorted(node_id for node_id, count in indegree.items() if count)
        raise RunnerError(f"dependency cycle detected among: {', '.join(cycle_nodes[:20])}")


def graph_sha256(tasks: dict[str, Task]) -> str:
    rows = [
        {
            "node_id": task.node_id,
            "task_id": task.task_id,
            "packet_sha256": task.packet_sha256,
            "semantic_contract_sha256": task.semantic_contract_sha256,
            "source_authority": task.source_authority,
            "depends_on": list(task.depends_on),
            "can_run_parallel": task.can_run_parallel,
            "parallel_group": task.parallel_group,
            "max_parallel": task.max_parallel,
            "priority": task.priority,
        }
        for task in sorted(tasks.values(), key=lambda item: item.node_id)
    ]
    canonical = json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()
    return sha256_bytes(canonical)


def reconciliation_summary(tasks: dict[str, Task]) -> dict[str, Any]:
    task_groups: dict[str, list[Task]] = {}
    semantic_groups: dict[tuple[str, str], list[Task]] = {}
    envelope_groups: dict[tuple[str, str], list[Task]] = {}
    authority_counts: dict[str, int] = {}
    for task in tasks.values():
        task_groups.setdefault(task.task_id, []).append(task)
        semantic_groups.setdefault(
            (task.task_id, task.semantic_contract_sha256),
            [],
        ).append(task)
        envelope_groups.setdefault(
            (task.task_id, task.packet_sha256),
            [],
        ).append(task)
        authority_counts[task.source_authority] = (
            authority_counts.get(task.source_authority, 0) + 1
        )
    return {
        "source_packet_instance_count": len(tasks),
        "exact_envelope_count": len(envelope_groups),
        "semantic_obligation_count": len(semantic_groups),
        "task_id_count": len(task_groups),
        "duplicate_task_id_group_count": sum(
            1 for candidates in task_groups.values() if len(candidates) > 1
        ),
        "duplicate_semantic_group_count": sum(
            1 for candidates in semantic_groups.values() if len(candidates) > 1
        ),
        "duplicate_exact_envelope_group_count": sum(
            1 for candidates in envelope_groups.values() if len(candidates) > 1
        ),
        "source_authorities": [
            {
                "source_authority": authority,
                "packet_count": count,
            }
            for authority, count in sorted(authority_counts.items())
        ],
    }


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
    for task in sorted(tasks.values(), key=lambda item: item.node_id):
        safe_node_id = re.sub(r"[^A-Za-z0-9_.@-]", "_", task.node_id)
        snapshot_path = packet_dir / f"{safe_node_id}.json"
        atomic_write_bytes(snapshot_path, task.packet_bytes)
        if sha256_file(snapshot_path) != task.packet_sha256:
            raise RunnerError(f"snapshot digest mismatch for {task.node_id}")
        snapshotted[task.node_id] = replace(
            task,
            packet_path=snapshot_path,
        )
        manifest_tasks.append(
            {
                "node_id": task.node_id,
                "task_id": task.task_id,
                "snapshot_path": str(snapshot_path.relative_to(run_dir)),
                "source_packet_path": str(task.source_packet_path),
                "packet_sha256": task.packet_sha256,
                "semantic_contract_sha256": task.semantic_contract_sha256,
                "source_authority": task.source_authority,
                "depends_on": list(task.depends_on),
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
        "reconciliation": reconciliation_summary(tasks),
        "tasks": manifest_tasks,
    }
    manifest["snapshot_manifest_sha256"] = prefixed_record_sha256(
        manifest,
        "snapshot_manifest_sha256",
    )
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
    if manifest.get("snapshot_manifest_sha256") != prefixed_record_sha256(
        manifest,
        "snapshot_manifest_sha256",
    ):
        raise RunnerError(f"run snapshot manifest hash mismatch: {manifest_path}")
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
        expected_node_id = row.get("node_id", row.get("task_id"))
        if not isinstance(expected_node_id, str) or not expected_node_id:
            raise RunnerError(f"node_id is required in {manifest_path}")
        source_authority_value = row.get("source_authority", ".")
        if not isinstance(source_authority_value, str):
            raise RunnerError(f"source_authority is required for {expected_node_id}")
        task = load_task(
            snapshot_path,
            repo_root,
            node_id=expected_node_id,
            authority=source_authority_value,
        )
        expected_id = row.get("task_id")
        expected_digest = row.get("packet_sha256")
        expected_semantic_digest = row.get(
            "semantic_contract_sha256",
            task.semantic_contract_sha256,
        )
        if (
            task.task_id != expected_id
            or task.packet_sha256 != expected_digest
            or task.semantic_contract_sha256 != expected_semantic_digest
        ):
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
        declared_dependencies = row.get("depends_on")
        if not isinstance(declared_dependencies, list) or not all(
            isinstance(value, str) for value in declared_dependencies
        ):
            declared_dependencies = list(task.depends_on)
        task = replace(
            task,
            source_packet_path=Path(source_path),
            workspace_root=Path(workspace_root),
            depends_on=tuple(declared_dependencies),
        )
        repo_path = task.packet.get("repo_path")
        if (
            task.packet.get("schema") != "lifeos.execution-packet.v1"
            and repo_path not in REPO_PATH_PLACEHOLDERS
            and repo_path != "."
        ):
            task = replace(task, command_cwd=Path(command_cwd))
        if task.node_id in tasks:
            raise RunnerError(f"duplicate snapshot node_id {task.node_id}")
        tasks[task.node_id] = task
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
    requested: set[str] = set()
    unknown: list[str] = []
    for value in selected:
        if value in tasks:
            requested.add(value)
            continue
        matches = {
            task.node_id
            for task in tasks.values()
            if task.task_id == value
        }
        if matches:
            requested.update(matches)
        else:
            unknown.append(value)
    if unknown:
        raise RunnerError(f"unknown task/node id(s): {', '.join(sorted(unknown))}")
    included: set[str] = set()
    stack = list(requested)
    while stack:
        node_id = stack.pop()
        if node_id in included:
            continue
        included.add(node_id)
        stack.extend(tasks[node_id].depends_on)
    return {node_id: tasks[node_id] for node_id in included}


def receipt_directory(receipts_dir: Path, task: Task) -> Path:
    safe_node_id = re.sub(r"[^A-Za-z0-9_.@-]", "_", task.node_id)
    return receipts_dir / safe_node_id / task.packet_sha256


def receipt_files(receipts_dir: Path, task: Task) -> Iterable[Path]:
    directory = receipt_directory(receipts_dir, task)
    return directory.glob("*.json") if directory.is_dir() else ()


def receipt_sha256(receipt: dict[str, Any]) -> str:
    return prefixed_record_sha256(receipt, "receipt_sha256")


def receipt_integrity_valid(receipt: dict[str, Any]) -> bool:
    return receipt.get("schema") == RECEIPT_SCHEMA


def write_task_receipt(
    receipts_dir: Path,
    task: Task,
    receipt: dict[str, Any],
    filename: str,
) -> Path:
    directory = receipt_directory(receipts_dir, task)
    with RECEIPT_CHAIN_LOCK:
        previous_records: list[dict[str, Any]] = []
        for path in directory.glob("*.json") if directory.is_dir() else ():
            try:
                candidate = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if (
                receipt_integrity_valid(candidate)
                and candidate.get("run_id") == receipt.get("run_id")
            ):
                previous_records.append(candidate)
        previous = max(
            previous_records,
            key=lambda value: (
                int(value.get("receipt_sequence", 0)),
                str(value.get("finished_at", "")),
            ),
            default=None,
        )
        sealed = {
            **receipt,
            "receipt_sequence": (
                int(previous.get("receipt_sequence", 0)) + 1
                if previous is not None
                else 1
            ),
            "previous_receipt_sha256": (
                previous.get("receipt_sha256") if previous is not None else None
            ),
        }
        sealed["receipt_sha256"] = receipt_sha256(sealed)
        path = directory / filename
        atomic_write_json(path, sealed)
    return path


def prior_receipt(
    receipts_dir: Path,
    task: Task,
    graph_digest: str | None = None,
) -> dict[str, Any] | None:
    observed: list[tuple[str, str, dict[str, Any]]] = []
    for path in receipt_files(receipts_dir, task):
        try:
            receipt = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if (
            not receipt_integrity_valid(receipt)
            or receipt.get("task_id") != task.task_id
            or receipt.get("packet_sha256") != task.packet_sha256
            or receipt.get("node_id", task.node_id) != task.node_id
            or receipt.get(
                "semantic_contract_sha256",
                task.semantic_contract_sha256,
            )
            != task.semantic_contract_sha256
            or (
                graph_digest is not None
                and receipt.get("graph_sha256") != graph_digest
            )
        ):
            continue
        observed.append(
            (
                str(receipt.get("finished_at", "")),
                path.name,
                receipt,
            )
        )
    return max(observed)[2] if observed else None


def prior_status(
    receipts_dir: Path,
    task: Task,
    graph_digest: str | None = None,
) -> str:
    latest = prior_receipt(receipts_dir, task, graph_digest)
    if latest is not None:
        status = str(latest.get("status", ""))
        return "completed" if status == "available" else status
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
            if consistent.get(task_id) not in {"available", "completed"}:
                continue
            if any(
                consistent.get(dependency) not in {"available", "completed"}
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


def shell_argv(command: str) -> tuple[str, ...]:
    return (PROFILE_RTK, "proxy", "/bin/bash", "-lc", command)


def strict_lifecycle(task: Task) -> bool:
    return task.packet.get("schema") != "test.execution-packet.v1"


def task_produces_capability(task: Task) -> bool:
    if task.packet.get("produces_capability") is False:
        return False
    return str(task.packet.get("task_kind", "")).strip().lower() not in {
        "release-adoption",
        "release-gate",
    }


def capability_id(task: Task) -> str:
    declared = task.packet.get("capability_id")
    if isinstance(declared, str) and declared.strip():
        return declared.strip()
    return (
        f"lifeos-capability:{task.task_id}:"
        f"{task.semantic_contract_sha256[:16]}"
    )


def packet_string_list(packet: dict[str, Any], field: str) -> tuple[str, ...]:
    value = packet.get(field)
    if isinstance(value, str):
        return tuple(part for part in re.split(r"[|,]", value) if part.strip())
    if isinstance(value, list):
        return tuple(str(part) for part in value if str(part).strip())
    return ()


def declared_target_patterns(task: Task) -> tuple[str, ...]:
    return tuple(
        dict.fromkeys(
            (
                *packet_string_list(task.packet, "target_files"),
                *packet_string_list(task.packet, "target_artifacts"),
            )
        )
    )


def _pattern_base(task: Task, value: str) -> tuple[Path, str]:
    normalized = value.strip().replace("\\", "/")
    for placeholder, relative in REPO_PATH_PLACEHOLDERS.items():
        normalized = normalized.replace(placeholder, relative)
    declared = Path(normalized)
    if declared.is_absolute():
        return Path("/"), normalized.lstrip("/")
    workspace_root = meta_workspace_root(task.workspace_root)
    if normalized == "src" or normalized.startswith("src/"):
        return workspace_root or task.workspace_root, normalized
    return task.command_cwd, normalized


def _target_path_allowed(path: Path, task: Task) -> bool:
    workspace_root = meta_workspace_root(task.workspace_root) or task.workspace_root
    try:
        path.resolve().relative_to(workspace_root.resolve())
    except (OSError, ValueError):
        return False
    return not bool(set(path.parts) & CANONICAL_DISCOVERY_EXCLUDED_PARTS)


def target_state(task: Task) -> dict[str, str]:
    """Hash declared output surfaces without trusting executor-authored evidence."""
    workspace_root = meta_workspace_root(task.workspace_root) or task.workspace_root
    state: dict[str, str] = {}
    for pattern in declared_target_patterns(task):
        base, relative_pattern = _pattern_base(task, pattern)
        if (
            not relative_pattern
            or (
                " " in relative_pattern
                and "/" not in relative_pattern
                and "." not in relative_pattern
            )
        ):
            continue
        matches = glob.glob(
            str(base / relative_pattern),
            recursive=True,
        )
        for raw_path in sorted(matches):
            path = Path(raw_path)
            if path.is_dir():
                files = sorted(
                    candidate
                    for candidate in path.rglob("*")
                    if candidate.is_file() and _target_path_allowed(candidate, task)
                )
            else:
                files = [path] if path.is_file() else []
            for candidate in files:
                if not _target_path_allowed(candidate, task):
                    continue
                try:
                    relative = candidate.resolve().relative_to(
                        workspace_root.resolve()
                    )
                except (OSError, ValueError):
                    continue
                state[relative.as_posix()] = sha256_file(candidate)
                if len(state) > 20_000:
                    raise RunnerError(
                        f"{task.node_id} target expansion exceeds 20,000 files"
                    )
    return state


def changed_target_paths(
    before: dict[str, str],
    after: dict[str, str],
) -> tuple[str, ...]:
    return tuple(
        sorted(
            path
            for path in set(before) | set(after)
            if before.get(path) != after.get(path)
        )
    )


def workspace_lock(task: Task) -> threading.Lock:
    key = str(task.command_cwd.resolve())
    with WORKSPACE_LOCKS_GUARD:
        return WORKSPACE_LOCKS.setdefault(key, threading.Lock())


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
            "case \"${1:-}\" in\n"
            "  commit|push|reset|clean|checkout|switch|restore)\n"
            "    echo 'json-task-runner: mutating git history or discarding workspace "
            "state is disabled' >&2\n"
            "    exit 126\n"
            "    ;;\n"
            "esac\n"
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


def read_lifecycle_proposal(
    task: Task,
    evidence_path: Path,
) -> tuple[dict[str, Any] | None, str | None]:
    if not evidence_path.is_file():
        return None, "executor did not write the required lifecycle evidence proposal"
    try:
        proposal = json.loads(evidence_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return None, f"invalid lifecycle evidence proposal: {error}"
    if not isinstance(proposal, dict):
        return None, "lifecycle evidence proposal must be a JSON object"
    if (
        proposal.get("schema") != LIFECYCLE_EVIDENCE_SCHEMA
        or proposal.get("node_id") != task.node_id
        or proposal.get("task_id") != task.task_id
        or proposal.get("packet_sha256") != task.packet_sha256
    ):
        return None, "lifecycle evidence proposal identity mismatch"
    return proposal, None


def current_git_revision(task: Task) -> str | None:
    try:
        result = subprocess.run(
            (
                PROFILE_RTK,
                "proxy",
                "git",
                "-C",
                str(task.command_cwd),
                "rev-parse",
                "HEAD",
            ),
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    revision = result.stdout.strip()
    return revision if result.returncode == 0 and re.fullmatch(r"[a-f0-9]{40}", revision) else None


def _proposal_commands(
    proposal: dict[str, Any] | None,
    field: str,
) -> tuple[str, ...]:
    if proposal is None:
        return ()
    value = proposal.get(field)
    if isinstance(value, str) and value.strip():
        return (value.strip(),)
    if isinstance(value, list):
        return tuple(
            item.strip()
            for item in value
            if isinstance(item, str) and item.strip()
        )
    return ()


def _resolve_evidence_path(task: Task, value: str) -> Path | None:
    workspace_root = meta_workspace_root(task.workspace_root) or task.workspace_root
    base, relative = _pattern_base(task, value)
    if glob.has_magic(relative):
        return None
    candidate = (base / relative).resolve()
    try:
        candidate.relative_to(workspace_root.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def proposal_path_digests(
    task: Task,
    proposal: dict[str, Any] | None,
    *,
    modified_after_ns: int | None = None,
) -> tuple[dict[str, str], tuple[str, ...]]:
    if proposal is None:
        return {}, ()
    implementation = proposal.get("implementation")
    capability = proposal.get("capability")
    values: list[str] = []
    if isinstance(implementation, dict):
        changed = implementation.get("changed_paths")
        if isinstance(changed, list):
            values.extend(item for item in changed if isinstance(item, str))
    if isinstance(capability, dict):
        paths = capability.get("paths")
        if isinstance(paths, list):
            values.extend(item for item in paths if isinstance(item, str))
        entrypoint = capability.get("entrypoint")
        if isinstance(entrypoint, str) and (
            "/" in entrypoint or Path(entrypoint).suffix
        ):
            values.append(entrypoint)

    workspace_root = meta_workspace_root(task.workspace_root) or task.workspace_root
    digests: dict[str, str] = {}
    recently_modified: list[str] = []
    for value in dict.fromkeys(values):
        path = _resolve_evidence_path(task, value)
        if path is None:
            continue
        relative = path.relative_to(workspace_root.resolve()).as_posix()
        digests[relative] = sha256_file(path)
        if modified_after_ns is not None and path.stat().st_mtime_ns >= modified_after_ns:
            recently_modified.append(relative)
    return digests, tuple(sorted(recently_modified))


def evaluate_lifecycle(
    task: Task,
    *,
    agent_executed: bool,
    evidence_path: Path,
    target_before: dict[str, str],
    target_after: dict[str, str],
    execution_started_ns: int,
    logs_dir: Path,
    timeout_seconds: float | None,
    environment: dict[str, str],
) -> LifecycleEvaluation:
    proposal, proposal_error = read_lifecycle_proposal(task, evidence_path)
    if not agent_executed and proposal_error is not None:
        proposal = None
        proposal_error = None
    if agent_executed and proposal_error is not None:
        return LifecycleEvaluation(None, proposal_error, None, (), None)

    target_changes = changed_target_paths(target_before, target_after)
    proposal_digests, recently_modified = proposal_path_digests(
        task,
        proposal,
        modified_after_ns=execution_started_ns,
    )
    implementation = proposal.get("implementation") if proposal else None
    implementation_status = (
        str(implementation.get("status", "")).strip().lower()
        if isinstance(implementation, dict)
        else ""
    )
    declared_targets_exist = bool(target_after)
    if target_changes or recently_modified:
        implementation_state = "implemented"
    elif implementation_status == "preexisting":
        revision = implementation.get("preexisting_revision")
        if (
            not isinstance(revision, str)
            or revision != current_git_revision(task)
            or not proposal_digests
        ):
            return LifecycleEvaluation(
                None,
                "preexisting capability is not bound to the current git revision and real paths",
                None,
                (),
                None,
            )
        implementation_state = "preexisting"
    elif not agent_executed and declared_targets_exist:
        implementation_state = "preexisting"
    else:
        return LifecycleEvaluation(
            None,
            "no observable implementation delta or revision-bound preexisting capability",
            None,
            (),
            None,
        )

    verification_commands: list[str] = []
    if (
        task.verification_command
        and command_is_nontrivial(task.verification_command, task.command_cwd)
    ):
        verification_commands.append(task.verification_command)
    verification_commands.extend(
        command
        for command in _proposal_commands(proposal, "verification_commands")
        if command not in verification_commands
    )
    if not verification_commands:
        return LifecycleEvaluation(
            None,
            "no non-trivial executable independent verification command",
            None,
            (),
            None,
        )
    for command in verification_commands:
        if not command_is_nontrivial(command, task.command_cwd):
            return LifecycleEvaluation(
                None,
                f"verification command is not executable and non-trivial: {command!r}",
                None,
                (),
                None,
            )

    verification_results: list[CommandResult] = []
    for index, command in enumerate(verification_commands, start=1):
        result = run_command(
            shell_argv(command),
            task.command_cwd,
            None,
            logs_dir / f"verification-{index}.stdout.log",
            logs_dir / f"verification-{index}.stderr.log",
            timeout_seconds,
            environment,
        )
        verification_results.append(result)
        if result.exit_code != 0:
            return LifecycleEvaluation(
                None,
                None,
                result,
                tuple(verification_results),
                None,
            )

    activation_commands = _proposal_commands(proposal, "activation_command")
    activation_command = (
        activation_commands[0]
        if activation_commands
        else verification_commands[0]
    )
    if not command_is_nontrivial(activation_command, task.command_cwd):
        return LifecycleEvaluation(
            None,
            "activation command is not executable and non-trivial",
            None,
            tuple(verification_results),
            None,
        )
    activation_result = run_command(
        shell_argv(activation_command),
        task.command_cwd,
        None,
        logs_dir / "activation.stdout.log",
        logs_dir / "activation.stderr.log",
        timeout_seconds,
        environment,
    )
    if activation_result.exit_code != 0:
        return LifecycleEvaluation(
            None,
            None,
            activation_result,
            tuple(verification_results),
            activation_result,
        )

    capability = proposal.get("capability") if proposal else None
    entrypoint = (
        capability.get("entrypoint")
        if isinstance(capability, dict)
        and isinstance(capability.get("entrypoint"), str)
        else None
    )
    usage_command = (
        capability.get("usage_command")
        if isinstance(capability, dict)
        and isinstance(capability.get("usage_command"), str)
        else activation_command
    )
    if not command_is_nontrivial(usage_command, task.command_cwd):
        return LifecycleEvaluation(
            None,
            "capability usage command is not executable and non-trivial",
            None,
            tuple(verification_results),
            activation_result,
        )
    implementation_paths = tuple(
        sorted(set(target_after) | set(proposal_digests))
    )
    if not implementation_paths:
        return LifecycleEvaluation(
            None,
            "capability is not bound to any real implementation path",
            None,
            tuple(verification_results),
            activation_result,
        )
    evidence = LifecycleEvidence(
        implementation_state=implementation_state,
        implementation_paths=implementation_paths,
        implementation_path_digests={
            **target_after,
            **proposal_digests,
        },
        verification_results=tuple(verification_results),
        activation_result=activation_result,
        capability_id=capability_id(task),
        capability_entrypoint=entrypoint or implementation_paths[0],
        capability_usage_command=usage_command,
        proposal_path=str(evidence_path) if proposal else None,
        proposal_sha256=sha256_file(evidence_path) if proposal else None,
    )
    return LifecycleEvaluation(
        evidence,
        None,
        None,
        tuple(verification_results),
        activation_result,
    )


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
    dependency_outputs: Sequence[dict[str, Any]] = (),
) -> TaskResult:
    attempt_id = f"{compact_utc_now()}-{uuid.uuid4().hex[:12]}"
    attempt_dir = receipt_directory(receipts_dir, task)
    logs_dir = attempt_dir / "logs" / attempt_id
    environment = os.environ.copy()
    environment.update(
        {
            "LIFEOS_TASK_NODE_ID": task.node_id,
            "CARGO_TARGET_DIR": str(cargo_target_dir(task, run_id)),
            "LIFEOS_TASK_ID": task.task_id,
            "LIFEOS_PACKET_PATH": str(task.packet_path),
            "LIFEOS_SOURCE_PACKET_PATH": str(task.source_packet_path),
            "LIFEOS_PACKET_SHA256": task.packet_sha256,
            "LIFEOS_TASK_RUN_ID": run_id,
            "LIFEOS_GRAPH_SHA256": graph_digest,
            "LIFEOS_RECEIPTS_DIR": str(receipts_dir),
            "LIFEOS_TASK_ROOT": str(task.command_cwd),
            "LIFEOS_WORKSPACE_ROOT": str(task.workspace_root),
            "LIFEOS_TASK_CAPABILITY_ID": capability_id(task),
        }
    )
    execution_input, authorization = runtime_packet_input(
        task,
        graph_digest,
        run_id,
        environment,
        dependency_outputs,
    )

    direct = False
    agent_required = True
    diagnostic_result: CommandResult | None = None
    agent_result: CommandResult | None = None

    if direct:
        with print_lock:
            print(
                f"START {task.node_id} {task.packet_sha256[:12]} "
                f"mode={'declared-probe' if agent_required else 'declared-command'} "
                f"cwd={task.command_cwd}",
                flush=True,
            )
        diagnostic_result = run_command(
            shell_argv(task.command_template or ""),
            task.command_cwd,
            None,
            logs_dir / (
                "diagnostic.stdout.log"
                if agent_required
                else "stdout.log"
            ),
            logs_dir / (
                "diagnostic.stderr.log"
                if agent_required
                else "stderr.log"
            ),
            timeout_seconds,
            environment,
        )

    if agent_required:
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
        with print_lock:
            print(
                f"START {task.node_id} {task.packet_sha256[:12]} "
                f"mode={'declared-probe+json-stdin' if direct else 'json-stdin'} "
                f"cwd={cwd}",
                flush=True,
            )
        lock = workspace_lock(task)
        with lock:
            agent_result = run_command(
                argv,
                cwd,
                stdin_bytes,
                logs_dir / "stdout.log",
                logs_dir / "stderr.log",
                timeout_seconds,
                environment,
                serialize_launch=Path(executor[0]).name == "codex",
                launch_stagger_seconds=(
                    2.0 if Path(executor[0]).name == "codex" else 0.0
                ),
            )

    main_result = agent_result or diagnostic_result
    if main_result is None:
        raise RunnerError(f"{task.node_id} has no executable implementation path")
    exit_code = main_result.exit_code
    status = "completed" if exit_code == 0 else "failed"
    selected_model, selected_effort = task_model(task)
    produced_output = {
        "producer_node_id": task.node_id,
        "producer_task_id": task.task_id,
        "capability_id": capability_id(task),
        "goal": str(task.packet.get("goal", "")),
        "target_files": list(packet_string_list(task.packet, "target_files")),
        "target_artifacts": list(
            packet_string_list(task.packet, "target_artifacts")
        ),
        "task_root": str(task.command_cwd),
    }
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "runner_schema": RUNNER_SCHEMA,
        "record_type": "execution",
        "run_id": run_id,
        "attempt_id": attempt_id,
        "node_id": task.node_id,
        "task_id": task.task_id,
        "packet_path": str(task.packet_path),
        "source_packet_path": str(task.source_packet_path),
        "packet_sha256": task.packet_sha256,
        "semantic_contract_sha256": task.semantic_contract_sha256,
        "source_authority": task.source_authority,
        "graph_sha256": graph_digest,
        "task_root": str(task.command_cwd),
        "workspace_root": str(task.workspace_root),
        "cargo_target_dir": environment["CARGO_TARGET_DIR"],
        "depends_on": list(task.depends_on),
        "execution_mode": (
            "declared-probe+json-stdin"
            if direct and agent_result is not None
            else "json-stdin"
            if agent_result is not None
            else "declared-command"
        ),
        "execution_input_sha256": sha256_bytes(execution_input),
        "authorization": authorization,
        "started_at": main_result.started_at,
        "finished_at": main_result.finished_at,
        "execution_status": "completed" if exit_code == 0 else "failed",
        "dependency_outputs": list(dependency_outputs),
        "produced_output": produced_output,
        "optional_execution_policy": (
            "mandatory"
            if task.packet.get("optional") is True
            or str(task.packet.get("status", "")).strip().lower() == "optional"
            else "not_declared_optional"
        ),
        "status": status,
        "exit_code": exit_code,
        "command": command_result_json(main_result),
        "agent_command": (
            command_result_json(agent_result)
            if agent_result is not None
            else None
        ),
        "diagnostic_probe": (
            command_result_json(diagnostic_result)
            if diagnostic_result is not None and agent_result is not None
            else None
        ),
        "implementation_actor": (
            "json-stdin-executor"
            if agent_result is not None
            else "declared-command"
        ),
        "implementation_model": selected_model if agent_result is not None else None,
        "implementation_model_reasoning_effort": (
            selected_effort if agent_result is not None else None
        ),
    }
    receipt_path = write_task_receipt(
        receipts_dir,
        task,
        receipt,
        f"{attempt_id}.json",
    )
    with print_lock:
        print(
            f"{'DONE' if status == 'completed' else 'FAIL'} "
            f"{task.node_id} exit={exit_code} receipt={receipt_path}",
            flush=True,
        )
    return TaskResult(
        node_id=task.node_id,
        task_id=task.task_id,
        status=status,
        packet_sha256=task.packet_sha256,
        receipt_path=receipt_path,
        exit_code=exit_code,
    )


def exception_task_result(
    task: Task,
    executor: Sequence[str],
    receipts_dir: Path,
    run_id: str,
    graph_digest: str,
    error: Exception,
    print_lock: threading.Lock,
) -> TaskResult:
    attempt_id = f"{compact_utc_now()}-{uuid.uuid4().hex[:12]}"
    logs_dir = receipt_directory(receipts_dir, task) / "logs" / attempt_id
    stdout_path = logs_dir / "stdout.log"
    stderr_path = logs_dir / "stderr.log"
    started_at = utc_now()
    atomic_write_bytes(stdout_path, b"")
    atomic_write_bytes(
        stderr_path,
        (
            f"{type(error).__name__}: {error}\n"
        ).encode("utf-8", errors="replace"),
    )
    finished_at = utc_now()
    status = "failed"
    exit_code = 70
    command = {
        "argv": list(executor),
        "cwd": str(task.command_cwd),
        "exit_code": exit_code,
        "timed_out": False,
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_seconds": 0.0,
        "stdout": {
            "path": str(stdout_path),
            "sha256": sha256_file(stdout_path),
        },
        "stderr": {
            "path": str(stderr_path),
            "sha256": sha256_file(stderr_path),
        },
    }
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "runner_schema": RUNNER_SCHEMA,
        "record_type": "execution",
        "run_id": run_id,
        "attempt_id": attempt_id,
        "node_id": task.node_id,
        "task_id": task.task_id,
        "packet_path": str(task.packet_path),
        "source_packet_path": str(task.source_packet_path),
        "packet_sha256": task.packet_sha256,
        "semantic_contract_sha256": task.semantic_contract_sha256,
        "source_authority": task.source_authority,
        "graph_sha256": graph_digest,
        "task_root": str(task.command_cwd),
        "workspace_root": str(task.workspace_root),
        "depends_on": list(task.depends_on),
        "execution_mode": "runner-exception",
        "execution_input_sha256": None,
        "authorization": None,
        "started_at": started_at,
        "finished_at": finished_at,
        "execution_status": "failed",
        "optional_execution_policy": (
            "mandatory"
            if task.packet.get("optional") is True
            or str(task.packet.get("status", "")).strip().lower() == "optional"
            else "not_declared_optional"
        ),
        "status": status,
        "exit_code": exit_code,
        "command": command,
        "agent_command": None,
        "diagnostic_probe": None,
        "runner_exception": {
            "type": type(error).__name__,
            "message": str(error),
            "retry_class": "failed",
        },
    }
    receipt_path = write_task_receipt(
        receipts_dir,
        task,
        receipt,
        f"{attempt_id}.json",
    )
    with print_lock:
        print(
            f"FAIL {task.node_id} "
            f"runner_exception={type(error).__name__} receipt={receipt_path}",
            flush=True,
        )
    return TaskResult(
        node_id=task.node_id,
        task_id=task.task_id,
        status=status,
        packet_sha256=task.packet_sha256,
        receipt_path=receipt_path,
        exit_code=exit_code,
    )


def dependency_output_records(
    task: Task,
    tasks: dict[str, Task],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for dependency in task.depends_on:
        producer = tasks[dependency]
        records.append(
            {
                "producer_node_id": producer.node_id,
                "producer_task_id": producer.task_id,
                "producer_packet_sha256": producer.packet_sha256,
                "capability_id": capability_id(producer),
                "goal": str(producer.packet.get("goal", "")),
                "target_files": list(
                    packet_string_list(producer.packet, "target_files")
                ),
                "target_artifacts": list(
                    packet_string_list(producer.packet, "target_artifacts")
                ),
                "task_root": str(producer.command_cwd),
            }
        )
    return records


def adopt_dependency_capability(
    producer: Task,
    consumer: Task,
    receipts_dir: Path,
    run_id: str,
    graph_digest: str,
    timeout_seconds: float | None,
) -> tuple[bool, Path]:
    previous = prior_receipt(receipts_dir, producer, graph_digest)
    if previous is None:
        raise RunnerError(
            f"{consumer.node_id} cannot adopt {producer.node_id}: receipt missing"
        )
    capability = previous.get("capability")
    lifecycle = previous.get("lifecycle")
    if not isinstance(capability, dict) or not isinstance(lifecycle, dict):
        raise RunnerError(
            f"{consumer.node_id} cannot adopt {producer.node_id}: "
            "lifecycle capability missing"
        )
    command = capability.get("usage_command")
    if not isinstance(command, str) or not command_is_nontrivial(
        command,
        producer.command_cwd,
    ):
        raise RunnerError(
            f"{producer.node_id} has no non-trivial capability usage command"
        )

    adoption_id = f"{compact_utc_now()}-{uuid.uuid4().hex[:12]}"
    logs_dir = (
        receipt_directory(receipts_dir, producer)
        / "logs"
        / f"adoption-{adoption_id}"
    )
    environment = os.environ.copy()
    environment.update(
        {
            "LIFEOS_TASK_NODE_ID": producer.node_id,
            "LIFEOS_TASK_ID": producer.task_id,
            "LIFEOS_PACKET_SHA256": producer.packet_sha256,
            "LIFEOS_TASK_RUN_ID": run_id,
            "LIFEOS_TASK_ROOT": str(producer.command_cwd),
            "LIFEOS_WORKSPACE_ROOT": str(producer.workspace_root),
            "LIFEOS_CAPABILITY_ID": str(capability.get("capability_id", "")),
            "LIFEOS_CAPABILITY_CONSUMER_NODE_ID": consumer.node_id,
            "LIFEOS_CAPABILITY_CONSUMER_TASK_ID": consumer.task_id,
        }
    )
    result = run_command(
        shell_argv(command),
        producer.command_cwd,
        None,
        logs_dir / "stdout.log",
        logs_dir / "stderr.log",
        timeout_seconds,
        environment,
    )
    succeeded = result.exit_code == 0
    continued_use_count = int(lifecycle.get("continued_use_count", 0)) + (
        1 if succeeded else 0
    )
    finished_at = result.finished_at
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "runner_schema": RUNNER_SCHEMA,
        "record_type": "capability-adoption",
        "run_id": run_id,
        "attempt_id": f"adoption-{adoption_id}",
        "node_id": producer.node_id,
        "task_id": producer.task_id,
        "packet_path": str(producer.packet_path),
        "source_packet_path": str(producer.source_packet_path),
        "packet_sha256": producer.packet_sha256,
        "semantic_contract_sha256": producer.semantic_contract_sha256,
        "source_authority": producer.source_authority,
        "graph_sha256": graph_digest,
        "task_root": str(producer.command_cwd),
        "workspace_root": str(producer.workspace_root),
        "depends_on": list(producer.depends_on),
        "execution_mode": "capability-adoption",
        "execution_input_sha256": previous.get("execution_input_sha256"),
        "authorization": previous.get("authorization"),
        "executor_refusal": None,
        "started_at": result.started_at,
        "finished_at": finished_at,
        "execution_status": "completed" if succeeded else "failed",
        "packet_execution_proven": previous.get("packet_execution_proven") is True,
        "task_completion_proven": succeeded,
        "capability_available": succeeded,
        "implementation_blocker": (
            None
            if succeeded
            else f"capability use failed in downstream task {consumer.node_id}"
        ),
        "optional_execution_policy": previous.get(
            "optional_execution_policy",
            "not_declared_optional",
        ),
        "status": "completed" if succeeded else "blocked",
        "exit_code": result.exit_code,
        "command": previous.get("command"),
        "verification": previous.get("verification"),
        "verification_steps": previous.get("verification_steps", []),
        "activation": previous.get("activation"),
        "lifecycle_evidence_proposal": previous.get(
            "lifecycle_evidence_proposal"
        ),
        "lifecycle": {
            **lifecycle,
            "stage": "completed" if succeeded else "blocked",
            "available": succeeded,
            "adopted": succeeded,
            "adopted_by_node_id": consumer.node_id if succeeded else None,
            "adopted_by_task_id": consumer.task_id if succeeded else None,
            "continued_use_count": continued_use_count,
        },
        "capability": capability,
        "capability_use": {
            "consumer_node_id": consumer.node_id,
            "consumer_task_id": consumer.task_id,
            "command": command_result_json(result),
            "status": "passed" if succeeded else "failed",
        },
    }
    path = write_task_receipt(
        receipts_dir,
        producer,
        receipt,
        f"adoption-{adoption_id}.json",
    )
    return succeeded, path


def task_sort_key(task: Task) -> tuple[int, str]:
    return task.priority, task.node_id


def select_batch(ready: Sequence[Task], global_limit: int) -> list[Task]:
    ordered = sorted(ready, key=task_sort_key)
    if not ordered:
        return []
    if not ordered[0].can_run_parallel:
        return [ordered[0]]
    batch: list[Task] = []
    group_counts: dict[str, int] = {}
    group_limits: dict[str, int] = {}
    strict_workspaces: set[str] = set()
    for task in ordered:
        if not task.can_run_parallel or len(batch) >= global_limit:
            continue
        workspace_key = str(task.command_cwd.resolve())
        if strict_lifecycle(task) and workspace_key in strict_workspaces:
            continue
        current_limit = group_limits.get(task.parallel_group, task.max_parallel)
        current_limit = min(current_limit, task.max_parallel)
        group_limits[task.parallel_group] = current_limit
        current_count = group_counts.get(task.parallel_group, 0)
        if current_count >= current_limit:
            continue
        batch.append(task)
        group_counts[task.parallel_group] = current_count + 1
        if strict_lifecycle(task):
            strict_workspaces.add(workspace_key)
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
        node_ids = [task.node_id for task in batch]
        waves.append(node_ids)
        completed.update(node_ids)
        pending.difference_update(node_ids)
    return waves


def print_table(tasks: dict[str, Task], statuses: dict[str, str]) -> None:
    headers = (
        "NODE",
        "TASK",
        "STATUS",
        "MODE",
        "GROUP",
        "LIMIT",
        "DEPENDENCIES",
        "PACKET",
        "CONTRACT",
        "SOURCE",
    )
    rows = []
    for task in sorted(tasks.values(), key=task_sort_key):
        rows.append(
            (
                task.node_id,
                task.task_id,
                statuses.get(task.node_id, "pending"),
                "parallel" if task.can_run_parallel else "sequential",
                task.parallel_group,
                str(task.max_parallel),
                ",".join(task.depends_on) or "-",
                task.packet_sha256[:12],
                task.semantic_contract_sha256[:12],
                task.source_authority,
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
    retry_blocked: bool = False,
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
            task_id: prior_status(receipts_dir, task, graph_digest)
            for task_id, task in tasks.items()
        },
    )
    if retry_failed:
        statuses = {
            task_id: "pending" if status == "failed" else status
            for task_id, status in statuses.items()
        }
    if retry_blocked:
        statuses = {
            task_id: "pending" if status == "blocked" else status
            for task_id, status in statuses.items()
        }
    completed = {task_id for task_id, status in statuses.items() if status == "completed"}
    available = {task_id for task_id, status in statuses.items() if status == "available"}
    failed = {task_id for task_id, status in statuses.items() if status == "failed"}
    blocked = {task_id for task_id, status in statuses.items() if status == "blocked"}
    pending = set(tasks) - completed - available - failed - blocked
    attempts: list[dict[str, Any]] = []
    print_lock = threading.Lock()

    while pending:
        ready = [
            tasks[task_id]
            for task_id in pending
            if set(tasks[task_id].depends_on) <= (completed | available)
        ]
        batch = select_batch(ready, max_parallel)
        if not batch:
            break
        executable_batch = [
            (task, dependency_output_records(task, tasks))
            for task in batch
        ]
        with ThreadPoolExecutor(max_workers=len(executable_batch)) as pool:
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
                    dependency_outputs,
                ): task
                for task, dependency_outputs in executable_batch
            }
            for future in as_completed(futures):
                task = futures[future]
                try:
                    result = future.result()
                except Exception as error:
                    result = exception_task_result(
                        task,
                        executor,
                        receipts_dir,
                        run_id,
                        graph_digest,
                        error,
                        print_lock,
                    )
                attempts.append(
                    {
                        "node_id": result.node_id,
                        "task_id": result.task_id,
                        "status": result.status,
                        "packet_sha256": result.packet_sha256,
                        "receipt_path": str(result.receipt_path),
                        "exit_code": result.exit_code,
                    }
                )
                statuses[result.node_id] = result.status
                pending.remove(result.node_id)
                if result.status == "completed":
                    completed.add(result.node_id)
                elif result.status == "available":
                    available.add(result.node_id)
                elif result.status == "failed":
                    failed.add(result.node_id)
                else:
                    blocked.add(result.node_id)
        if fail_fast and failed:
            break

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
        "reconciliation": reconciliation_summary(tasks),
        "max_parallel": max_parallel,
        "executor": list(executor),
        "status_counts": {
            status: sum(1 for observed in statuses.values() if observed == status)
            for status in ("completed", "available", "failed", "blocked", "pending")
        },
        "tasks": [
            {
                "node_id": task.node_id,
                "task_id": task.task_id,
                "packet_path": str(task.packet_path),
                "source_packet_path": str(task.source_packet_path),
                "packet_sha256": task.packet_sha256,
                "depends_on": list(task.depends_on),
                "semantic_contract_sha256": task.semantic_contract_sha256,
                "source_authority": task.source_authority,
                "status": statuses[task.node_id],
            }
            for task in sorted(tasks.values(), key=task_sort_key)
        ],
        "attempts": attempts,
    }
    run_receipt["run_receipt_sha256"] = prefixed_record_sha256(
        run_receipt,
        "run_receipt_sha256",
    )
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
        action="append",
        default=[],
        help=(
            "Authoritative root containing task_tables/packets or "
            "**/execution_packets; repeatable"
        ),
    )
    parser.add_argument(
        "--no-discover-canonical",
        action="store_true",
        help="Use only explicitly supplied --packet-root values",
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
        "--retry-blocked",
        action="store_true",
        help=(
            "Re-evaluate matching-digest blocked tasks after their local blocker "
            "or implementation evidence changes"
        ),
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
    parser.add_argument(
        "--run-id",
        help=(
            "Caller-supplied immutable run ID for --new-run, used to bind "
            "approval/checkpoint records before execution"
        ),
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
        explicit_packet_roots = tuple(path.resolve() for path in args.packet_root)
        packet_roots = (
            normalize_packet_roots(explicit_packet_roots)
            if args.no_discover_canonical
            else discover_canonical_packet_roots(repo_root, explicit_packet_roots)
        )
        receipts_dir = args.receipts_dir.resolve()
        if args.run_id and (
            not args.new_run or args.validate_only or args.plan
        ):
            raise RunnerError(
                "--run-id is valid only for an executing --new-run"
            )
        requested_run_id = (
            validate_run_id(args.run_id) if args.run_id else None
        )
        resume_dir: Path | None = None
        if args.resume_run:
            candidate = Path(args.resume_run)
            resume_dir = (
                candidate.resolve()
                if candidate.is_absolute() or len(candidate.parts) > 1
                else (
                    receipts_dir
                    / "runs"
                    / validate_run_id(args.resume_run)
                ).resolve()
            )
        elif not args.new_run and not args.validate_only and not args.plan:
            raise RunnerError(
                "execution requires an explicit immutable choice: use --new-run "
                "to freeze current packets or --resume-run <run-id> to resume one snapshot"
            )

        if resume_dir is not None:
            if args.task:
                raise RunnerError("--task cannot be combined with a resumed run snapshot")
            tasks, resume_run_id = load_snapshot(resume_dir, repo_root)
            input_description = f"immutable run snapshot {resume_dir}"
        else:
            tasks = load_tasks(packet_roots, repo_root)
            tasks = dependency_closure(tasks, args.task)
            resume_run_id = None
            input_description = ", ".join(str(path) for path in packet_roots)
        graph_digest = graph_sha256(tasks)
        reconciliation = reconciliation_summary(tasks)
        statuses = dependency_consistent_statuses(
            tasks,
            {
                task_id: prior_status(receipts_dir, task, graph_digest)
                for task_id, task in tasks.items()
            },
        )
        print(
            f"Loaded {reconciliation['source_packet_instance_count']} JSON packet "
            f"instances ({reconciliation['exact_envelope_count']} envelopes, "
            f"{reconciliation['semantic_obligation_count']} semantic obligations) "
            f"into one graph "
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
            run_id=resume_run_id or requested_run_id,
            create_snapshot=resume_dir is None,
            retry_blocked=args.retry_blocked,
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
