#!/usr/bin/env python3
"""Exercise the repo-native envctl/nu_plugin migration boundary."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


EXPECTED_ROUTES = {
    "EnvctlMigrationStatus": ["run", "status"],
    "EnvctlMigrationTimeline": ["run", "events"],
    "EnvctlMigrationOps": ["run", "ops"],
    "EnvctlMigrationApprovals": ["approval", "list", "--run"],
    "EnvctlMigrationArtifacts": ["run", "artifacts"],
    "EnvctlMigrationGraph": ["run", "export"],
    "EnvctlMigrationValidations": ["run", "validations"],
    "EnvctlMigrationReplay": ["run", "readiness"],
    "EnvctlMigrationRollbackPlan": ["rollback", "list"],
    "EnvctlMigrationProof": ["run", "export"],
}


def run(command: list[str], cwd: Path) -> str:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if result.returncode:
        sys.stderr.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(
            f"command failed ({result.returncode}) in {cwd}: {' '.join(command)}"
        )
    return result.stdout


def repo_path(variable: str) -> Path:
    value = os.environ.get(variable)
    if not value:
        raise SystemExit(f"{variable} must name the real repository checkout")
    path = Path(value).resolve()
    if not (path / ".git").exists():
        # A linked worktree has a .git file, while a normal checkout has a directory.
        raise SystemExit(f"{variable} is not a git checkout: {path}")
    return path


def assert_route(source: str, command: str, route: list[str]) -> None:
    marker = f"    {command},"
    start = source.find(marker)
    if start < 0:
        raise SystemExit(f"nu_plugin is missing {command}")
    block = source[start : start + 900]
    route_literal = "[" + ", ".join(f'"{part}"' for part in route) + "]"
    if route_literal not in block:
        raise SystemExit(
            f"{command} does not route to the envctl contract {route_literal}"
        )


def main() -> None:
    envctl = repo_path("ENVCTL_REPO")
    plugin = repo_path("NU_PLUGIN_REPO")
    envctl_source = envctl / "crates/cli/src/migration_cmd.rs"
    plugin_source = plugin / "crates/nu_plugin_codedb/src/main.rs"
    if not envctl_source.is_file() or not plugin_source.is_file():
        raise SystemExit("repo-native migration command sources are missing")

    plugin_text = plugin_source.read_text()
    for command, route in EXPECTED_ROUTES.items():
        assert_route(plugin_text, command, route)

    envctl_bin = os.environ.get("ENVCTL_BIN", "envctl")
    help_text = run([envctl_bin, "--json", "migration", "--help"], envctl)
    for command in ("run", "approval", "rollback", "edge"):
        if command not in help_text:
            raise SystemExit(f"envctl migration help is missing {command}")

    run(
        ["cargo", "test", "-q", "-p", "nu_plugin_codedb", "envctl_"],
        plugin,
    )

    report = {
        "schema_version": "1.0",
        "task_id": "REQ-041_TWO_REPO_INTEGRATION",
        "status": "passed",
        "envctl_repo": str(envctl),
        "envctl_revision": run(["git", "rev-parse", "HEAD"], envctl).strip(),
        "nu_plugin_repo": str(plugin),
        "nu_plugin_revision": run(["git", "rev-parse", "HEAD"], plugin).strip(),
        "nu_plugin_dirty": bool(run(["git", "status", "--porcelain"], plugin).strip()),
        "routes_verified": EXPECTED_ROUTES,
        "checks": [
            "active envctl migration CLI exposed required command groups",
            "nu_plugin envctl tests passed",
            "every plugin migration command routes to the matching envctl argv",
        ],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
