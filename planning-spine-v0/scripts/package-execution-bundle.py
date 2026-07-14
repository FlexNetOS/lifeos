#!/usr/bin/env python3
"""Package the planning-spine execution bundle after structural validation."""

from __future__ import annotations

import argparse
import hashlib
import json
import stat
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from reproducible_time import utc_now


MANIFEST_SCHEMA_VERSION = "lifeos-planning-spine.execution-bundle-manifest.v0"
REPORT_SCHEMA_VERSION = "lifeos-planning-spine.execution-bundle.validation-report.v0"
BUNDLE_TASK_ID = "LPS-018"
BUNDLE_PROOF_PATH = Path("proof_records/LPS-018.proof.json")
BUNDLE_LEDGER_PATH = Path("proof_records/proof_ledger.jsonl")

DEFAULT_OUTPUT = Path("dist/lifeos-planning-spine-execution-bundle.zip")
DEFAULT_MANIFEST = Path("dist/lifeos-planning-spine-execution-bundle.manifest.json")
DEFAULT_REPORT = Path("generated/execution_bundle.validation_report.json")

REQUIRED_PATHS = [
    Path("README.md"),
    Path("schemas/index.json"),
    Path("examples/mvp-bundle.json"),
    Path("generated/task_graph.normalized.json"),
    Path("generated/task_graph.status.json"),
    Path("generated/execution_manifest.json"),
    BUNDLE_LEDGER_PATH,
]

INCLUDE_PATTERNS = [
    "*.md",
    "rfcs/*.md",
    "schemas/*.json",
    "examples/*.json",
    "generated/**/*.json",
    "generated/**/*.csv",
    "proof_records/*.json",
    "proof_records/*.jsonl",
    "proof_records/fixtures/**/*.json",
    "scripts/*.py",
]

EXCLUDED_PARTS = {
    ".git",
    ".hg",
    ".svn",
    "__pycache__",
    "node_modules",
    "dist",
    "secrets",
    ".ssh",
}

SECRET_FILE_NAMES = {
    ".env",
    ".env.local",
    ".envrc",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
}

EXCLUDED_FILES = {
    Path("generated/execution_bundle.manifest.json"),
    Path("generated/execution_bundle.validation_report.json"),
    Path("dist/lifeos-planning-spine-execution-bundle.manifest.json"),
    Path("dist/lifeos-planning-spine-execution-bundle.SHA256SUMS"),
    Path("dist/lifeos-planning-spine-execution-bundle.zip.sha256"),
    BUNDLE_PROOF_PATH,
}


class BundleError(Exception):
    pass


@dataclass(frozen=True)
class PayloadFile:
    path: Path
    role: str
    size: int
    sha256: str
    content: bytes | None = None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def relative_path(path: Path, root: Path) -> Path:
    try:
        return path.resolve().relative_to(root.resolve())
    except ValueError as error:
        raise BundleError(f"path escapes package root: {path}") from error


def ensure_safe_member(path: Path) -> None:
    if path.is_absolute():
        raise BundleError(f"bundle member must be relative: {path}")
    if any(part == ".." for part in path.parts):
        raise BundleError(f"bundle member must not contain '..': {path}")
    if any(part in EXCLUDED_PARTS for part in path.parts):
        raise BundleError(f"bundle member uses excluded path component: {path}")
    if path.name in SECRET_FILE_NAMES:
        raise BundleError(f"bundle member looks like a secret-bearing file: {path}")
    lowered = path.name.lower()
    if lowered.endswith((".pem", ".key", ".p12", ".pfx", ".kdbx")):
        raise BundleError(f"bundle member has a secret-bearing suffix: {path}")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise BundleError(f"{path}: invalid JSON: {error}") from error


def validate_jsonl(path: Path) -> int:
    line_count = 0
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            json.loads(line)
        except json.JSONDecodeError as error:
            raise BundleError(f"{path}:{line_number}: invalid JSONL: {error}") from error
        line_count += 1
    if line_count == 0:
        raise BundleError(f"{path}: JSONL ledger has no entries")
    return line_count


def validate_jsonl_bytes(path: Path, data: bytes) -> int:
    line_count = 0
    text = data.decode("utf-8")
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            json.loads(line)
        except json.JSONDecodeError as error:
            raise BundleError(f"{path}:{line_number}: invalid bundled JSONL: {error}") from error
        line_count += 1
    if line_count == 0:
        raise BundleError(f"{path}: bundled JSONL ledger has no entries")
    return line_count


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_bundled_ledger(root: Path) -> tuple[bytes, int, int]:
    source = root / BUNDLE_LEDGER_PATH
    kept_lines: list[str] = []
    excluded_count = 0
    source_count = 0
    for line_number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as error:
            raise BundleError(f"{BUNDLE_LEDGER_PATH}:{line_number}: invalid JSONL: {error}") from error
        source_count += 1
        if entry.get("task_id") == BUNDLE_TASK_ID:
            excluded_count += 1
            continue
        kept_lines.append(line)

    if not kept_lines:
        raise BundleError(f"{BUNDLE_LEDGER_PATH}: bundled ledger snapshot would be empty")
    data = ("\n".join(kept_lines) + "\n").encode("utf-8")
    validate_jsonl_bytes(BUNDLE_LEDGER_PATH, data)
    return data, source_count, excluded_count


def role_for(path: Path) -> str:
    if path.parts[0] == "schemas":
        return "schema"
    if path.parts[0] == "examples":
        return "example"
    if path.parts[0] == "generated":
        return "generated-artifact"
    if path.parts[0] == "proof_records":
        return "proof-surface"
    if path.parts[0] == "scripts":
        return "execution-script"
    if path.parts[0] == "rfcs":
        return "context-rfc"
    if path.suffix == ".md":
        return "documentation"
    return "package-metadata"


def discover_payload(root: Path) -> list[PayloadFile]:
    paths: dict[str, Path] = {}
    for pattern in INCLUDE_PATTERNS:
        for path in root.glob(pattern):
            if not path.is_file():
                continue
            rel = relative_path(path, root)
            if rel in EXCLUDED_FILES:
                continue
            ensure_safe_member(rel)
            paths[str(rel)] = rel

    payload: list[PayloadFile] = []
    for rel in sorted(paths.values(), key=lambda item: item.as_posix()):
        abs_path = root / rel
        if rel == BUNDLE_LEDGER_PATH:
            data, _source_count, _excluded_count = build_bundled_ledger(root)
            payload.append(PayloadFile(rel, role_for(rel), len(data), sha256_bytes(data), data))
        else:
            payload.append(PayloadFile(rel, role_for(rel), abs_path.stat().st_size, sha256_file(abs_path)))
    return payload


def validate_required(root: Path, payload: list[PayloadFile]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    payload_paths = {item.path.as_posix() for item in payload}
    for required_path in REQUIRED_PATHS:
        present = required_path.as_posix() in payload_paths and (root / required_path).is_file()
        checks.append(
            {
                "name": f"required:{required_path.as_posix()}",
                "result": "pass" if present else "fail",
                "path": required_path.as_posix(),
            }
        )
        if not present:
            raise BundleError(f"required bundle artifact missing: {required_path}")

    manifest = load_json(root / "generated/execution_manifest.json")
    normalized = load_json(root / "generated/task_graph.normalized.json")
    ready_status = str(manifest.get("ready_status", "ready")).strip().lower()
    expected_task_ids = sorted(
        str(task.get("task_id", "")).strip()
        for task in normalized.get("tasks", [])
        if str(task.get("status", "")).strip().lower() == ready_status
    )
    manifest_task_ids = sorted(
        str(packet.get("task_id", "")).strip()
        for packet in manifest.get("packets", [])
        if isinstance(packet, dict)
    )
    packet_paths = []
    for packet in manifest.get("packets", []):
        path = packet.get("path")
        if isinstance(path, str):
            packet_paths.append(path)
    missing_packets = [path for path in packet_paths if path not in payload_paths]
    manifest_matches_graph = (
        manifest.get("packet_count") == len(packet_paths)
        and manifest_task_ids == expected_task_ids
    )
    checks.append(
        {
            "name": "execution_manifest_matches_ready_tasks",
            "result": "pass" if manifest_matches_graph and not missing_packets else "fail",
            "packet_count": len(packet_paths),
            "expected_task_ids": expected_task_ids,
            "manifest_task_ids": manifest_task_ids,
            "missing_packets": missing_packets,
        }
    )
    if not manifest_matches_graph:
        raise BundleError("generated/execution_manifest.json does not match normalized ready tasks")
    if missing_packets:
        raise BundleError("bundle is missing packet(s) named by execution manifest: " + ", ".join(missing_packets))

    status = load_json(root / "generated/task_graph.status.json")
    forbidden_update_count = status.get("forbidden_update_count")
    status_result = status.get("result")
    checks.append(
        {
            "name": "status_projection_passes_field_gate",
            "result": "pass" if status_result == "pass" and forbidden_update_count == 0 else "fail",
            "status_result": status_result,
            "forbidden_update_count": forbidden_update_count,
        }
    )
    if status_result != "pass" or forbidden_update_count != 0:
        raise BundleError("generated/task_graph.status.json does not pass the field-update gate")

    ledger_count = validate_jsonl(root / "proof_records/proof_ledger.jsonl")
    checks.append({"name": "proof_ledger_jsonl_valid", "result": "pass", "entry_count": ledger_count})
    bundled_ledger = next((item for item in payload if item.path == BUNDLE_LEDGER_PATH), None)
    if bundled_ledger is None or bundled_ledger.content is None:
        raise BundleError(f"bundle payload is missing sanitized ledger member: {BUNDLE_LEDGER_PATH}")
    bundled_ledger_count = validate_jsonl_bytes(BUNDLE_LEDGER_PATH, bundled_ledger.content)
    _, source_count, excluded_count = build_bundled_ledger(root)
    checks.append(
        {
            "name": "proof_ledger_bundle_snapshot_excludes_bundle_task",
            "result": "pass",
            "source_entry_count": source_count,
            "bundled_entry_count": bundled_ledger_count,
            "excluded_task_id": BUNDLE_TASK_ID,
            "excluded_entry_count": excluded_count,
        }
    )
    return checks


def validate_payload_json(root: Path, payload: list[PayloadFile]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    json_count = 0
    for item in payload:
        if item.path.suffix == ".json":
            load_json(root / item.path)
            json_count += 1
        elif item.path.suffix == ".jsonl":
            if item.content is not None:
                validate_jsonl_bytes(item.path, item.content)
            else:
                validate_jsonl(root / item.path)
    checks.append({"name": "payload_json_parse", "result": "pass", "json_file_count": json_count})
    return checks


def build_manifest(root: Path, payload: list[PayloadFile], checks: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "generated_at": utc_now(),
        "package_root": ".",
        "payload_file_count": len(payload),
        "roles": sorted({item.role for item in payload}),
        "validation": {
            "result": "pass",
            "checks": checks,
        },
        "files": [
            {
                "path": item.path.as_posix(),
                "role": item.role,
                "size_bytes": item.size,
                "sha256": item.sha256,
            }
            for item in payload
        ],
    }


def write_bundle(root: Path, output_path: Path, payload: list[PayloadFile], manifest: dict[str, Any]) -> None:
    def write_entry(archive: zipfile.ZipFile, name: str, content: bytes, mode: int = 0o644) -> None:
        info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | mode) << 16
        archive.writestr(info, content)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        write_entry(archive, "bundle_manifest.json", manifest_bytes)
        for item in payload:
            source_path = root / item.path
            content = item.content if item.content is not None else source_path.read_bytes()
            mode = source_path.stat().st_mode & 0o777
            write_entry(archive, item.path.as_posix(), content, mode)


def validate_zip(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path, "r") as archive:
        corrupt_member = archive.testzip()
        entries = archive.namelist()
    if corrupt_member is not None:
        raise BundleError(f"zip validation failed at member: {corrupt_member}")
    if "bundle_manifest.json" not in entries:
        raise BundleError("zip does not include bundle_manifest.json")
    return {
        "entry_count": len(entries),
        "has_bundle_manifest": True,
        "corrupt_member": corrupt_member,
    }


def package_bundle(root: Path, output: Path, manifest_path: Path, report_path: Path) -> dict[str, Any]:
    payload = discover_payload(root)
    checks = validate_required(root, payload)
    checks.extend(validate_payload_json(root, payload))
    manifest = build_manifest(root, payload, checks)

    write_json(manifest_path, manifest)
    write_bundle(root, output, payload, manifest)
    zip_validation = validate_zip(output)
    checksum_path = output.with_suffix(output.suffix + ".sha256")
    checksum = sha256_file(output)
    checksum_path.write_text(f"{checksum}  {output.name}\n", encoding="utf-8")
    checksum_manifest_path = output.parent / "lifeos-planning-spine-execution-bundle.SHA256SUMS"
    manifest_checksum = sha256_file(manifest_path)
    checksum_manifest_path.write_text(
        f"{checksum}  {output.name}\n{manifest_checksum}  {manifest_path.name}\n",
        encoding="utf-8",
    )

    report = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "generated_at": utc_now(),
        "result": "pass",
        "output_path": str(output),
        "checksum_path": str(checksum_path),
        "checksum_manifest_path": str(checksum_manifest_path),
        "sha256": checksum,
        "manifest_sha256": manifest_checksum,
        "payload_file_count": len(payload),
        "zip_validation": zip_validation,
        "manifest_path": str(manifest_path),
        "checks": checks,
        "exclusions": {
            "excluded_files": sorted(path.as_posix() for path in EXCLUDED_FILES),
            "excluded_path_parts": sorted(EXCLUDED_PARTS),
            "secret_file_names": sorted(SECRET_FILE_NAMES),
            "note": "The LPS-018 completion proof is recorded outside the bundle to avoid a self-referential release checksum loop.",
            "ledger_snapshot_note": "The bundled proof ledger is a sanitized snapshot that excludes LPS-018 entries; the live append-only ledger on disk remains unchanged.",
        },
    }
    write_json(report_path, report)
    return report


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        default=".",
        type=Path,
        help="planning-spine-v0 package root",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=DEFAULT_OUTPUT,
        type=Path,
        help="output zip path",
    )
    parser.add_argument(
        "--manifest",
        default=DEFAULT_MANIFEST,
        type=Path,
        help="generated bundle manifest path",
    )
    parser.add_argument(
        "--report",
        default=DEFAULT_REPORT,
        type=Path,
        help="generated validation report path",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    root = args.root.resolve()
    try:
        report = package_bundle(root, args.output, args.manifest, args.report)
    except BundleError as error:
        print(f"package-execution-bundle: error: {error}", file=sys.stderr)
        return 1

    print(
        "package-execution-bundle: "
        f"packaged {report['payload_file_count']} payload file(s) into {report['output_path']}; "
        f"sha256={report['sha256']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
