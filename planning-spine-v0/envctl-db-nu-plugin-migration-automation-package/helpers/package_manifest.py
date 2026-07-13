#!/usr/bin/env python3
"""Build, write, and verify the package's complete deterministic manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


MANIFEST_NAME = "PACKAGE_MANIFEST.json"
RUNTIME_CACHE_DIRS = {".git", ".pytest_cache", "__pycache__"}


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_manifest(root: Path | str) -> dict[str, Any]:
    root = Path(root).resolve()
    manifest_path = root / MANIFEST_NAME
    files: list[dict[str, Any]] = []

    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        if not path.is_file() or path == manifest_path:
            continue
        relative = path.relative_to(root)
        if any(part in RUNTIME_CACHE_DIRS for part in relative.parts):
            continue
        data = path.read_bytes()
        files.append(
            {
                "path": relative.as_posix(),
                "bytes": len(data),
                "sha256": _sha256(data),
            }
        )

    return {"package": root.name, "file_count": len(files), "files": files}


def manifest_text(manifest: dict[str, Any]) -> str:
    return f"{json.dumps(manifest, indent=2)}\n"


def write_manifest(root: Path | str) -> dict[str, Any]:
    root = Path(root).resolve()
    manifest = build_manifest(root)
    manifest_path = root / MANIFEST_NAME
    temporary_path = root / f".{MANIFEST_NAME}.tmp"
    temporary_path.write_text(manifest_text(manifest), encoding="utf-8")
    temporary_path.replace(manifest_path)
    return manifest


def check_manifest(root: Path | str) -> list[str]:
    root = Path(root).resolve()
    manifest_path = root / MANIFEST_NAME
    if not manifest_path.is_file():
        return [f"missing_manifest:{MANIFEST_NAME}"]

    try:
        declared = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return [f"invalid_manifest:{error}"]

    actual = build_manifest(root)
    errors: list[str] = []
    declared_files = declared.get("files")
    if not isinstance(declared_files, list):
        return ["invalid_manifest:files_must_be_an_array"]

    if declared.get("package") != actual["package"]:
        errors.append(
            f"package_name_mismatch:declared={declared.get('package')!r}:actual={actual['package']!r}"
        )
    if declared.get("file_count") != actual["file_count"]:
        errors.append(
            f"declared_file_count_mismatch:declared={declared.get('file_count')!r}:actual={actual['file_count']}"
        )
    if len(declared_files) != actual["file_count"]:
        errors.append(
            f"declared_entry_count_mismatch:declared={len(declared_files)}:actual={actual['file_count']}"
        )

    declared_by_path: dict[str, dict[str, Any]] = {}
    for entry in declared_files:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            errors.append("invalid_manifest_entry:object_with_path_required")
            continue
        entry_path = entry["path"]
        if entry_path in declared_by_path:
            errors.append(f"duplicate_path:{entry_path}")
        declared_by_path[entry_path] = entry

    actual_by_path = {entry["path"]: entry for entry in actual["files"]}
    for entry_path in sorted(actual_by_path.keys() - declared_by_path.keys()):
        errors.append(f"unlisted_file:{entry_path}")
    for entry_path in sorted(declared_by_path.keys() - actual_by_path.keys()):
        errors.append(f"missing_file:{entry_path}")
    for entry_path in sorted(actual_by_path.keys() & declared_by_path.keys()):
        current = actual_by_path[entry_path]
        recorded = declared_by_path[entry_path]
        if recorded.get("bytes") != current["bytes"] or recorded.get("sha256") != current["sha256"]:
            errors.append(f"hash_or_size_drift:{entry_path}")

    declared_paths = [entry.get("path") for entry in declared_files if isinstance(entry, dict)]
    actual_paths = [entry["path"] for entry in actual["files"]]
    if declared_paths != actual_paths:
        errors.append("path_order_mismatch")

    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "root",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="package root (default: parent of helpers/)",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="atomically replace PACKAGE_MANIFEST.json")
    mode.add_argument("--check", action="store_true", help="fail if PACKAGE_MANIFEST.json is incomplete or stale")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.write:
        manifest = write_manifest(args.root)
        print(f"WROTE: {MANIFEST_NAME} ({manifest['file_count']} files)")
        return 0
    if args.check:
        errors = check_manifest(args.root)
        if errors:
            print("ERROR: package manifest verification failed")
            for error in errors:
                print(f"- {error}")
            return 1
        print("OK: package manifest is complete and current")
        return 0

    print(manifest_text(build_manifest(args.root)), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
