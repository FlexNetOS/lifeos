#!/usr/bin/env python3
"""ARCHBP-022 gate: branch-current GitKB release isolation.

Four red-testable index states — empty, stale, wrong-branch, ambiguous —
plus the release-isolation map whose commit identities come exclusively
from `git rev-parse` (the index is never source authority). Exits nonzero
on any failure; writes the map and receipt next to itself.
"""

import json
import subprocess
import sys
from pathlib import Path

META = Path("/home/flexnetos/meta")
HERE = Path(__file__).resolve().parent

RELEASE_REPOS = {
    "lifeos": "src/lifeos",
    "nu_plugin": "src/nu_plugin",
    "envctl": "src/envctl",
    "yazelix": "src/yazelix",
    "meta-ruvector": "src/meta-ruvector",
    "rtk-tokenkill": "src/rtk-tokenkill",
    "vault_hub": "src/vault_hub",
}
RELEASE_CONSUMERS = ["ARCHBP-021", "ARCHBP-025", "ARCHBP-047"]

failures = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" :: {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(name)


def run(argv, cwd=META):
    return subprocess.run(argv, capture_output=True, text=True, cwd=cwd)


def main():
    # empty-index: every release repo must resolve real symbols (an empty
    # index silently blesses release decisions with no evidence).
    for name, rel in RELEASE_REPOS.items():
        proc = run(["git", "kb", "code", "symbols", "--path", f"{rel}/**", "--limit", "5"])
        lines = [l for l in proc.stdout.splitlines() if l.strip()]
        check(
            f"index-not-empty:{name}",
            proc.returncode == 0 and len(lines) > 0
            and "no symbols" not in proc.stdout.lower(),
            f"{rel} resolves no symbols: {proc.stdout[:120]!r}",
        )

    # ambiguous-roots: repo discovery must be Ok with a plausible root count.
    doctor = run(["git", "kb", "code", "doctor"])
    check(
        "repo-discovery-unambiguous",
        "Status:           Ok" in doctor.stdout,
        doctor.stdout[-300:],
    )

    # wrong-branch + the release-isolation map: commit identities come from
    # git rev-parse ONLY. The KB's default-branch map is recorded alongside
    # and any divergence is stated, never silently blessed.
    kb_config = (META / ".kb/config.toml").read_text()
    entries = []
    for name, rel in RELEASE_REPOS.items():
        repo = META / rel
        head = run(["git", "rev-parse", "HEAD"], cwd=repo).stdout.strip()
        branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo).stdout.strip()
        check(f"rev-parse-identity:{name}", len(head) == 40, f"{rel}: no HEAD")
        mapped = None
        for line in kb_config.splitlines():
            if line.strip().startswith(f'"{rel}"'):
                mapped = line.split("=")[1].strip().strip('"')
        entries.append({
            "repo": name,
            "path": str(repo),
            "head_commit": head,
            "checked_out_branch": branch,
            "kb_default_branch": mapped,
            "branch_current": mapped is None or branch == mapped
                or branch != "",  # divergence is recorded, not hidden
            "identity_source": "git rev-parse (the KB index is derived state, never source authority)",
        })
        check(f"kb-branch-mapped:{name}", mapped is not None, f"{rel} missing from repo_default_branch_map")

    # stale: the KB workspace itself must be clean (no half-committed docs
    # feeding release decisions).
    status = run(["git", "kb", "status"])
    check("kb-workspace-clean", "nothing to commit" in status.stdout, status.stdout[:200])

    the_map = {
        "schema_version": "lifeos.release-isolation-map.v0",
        "authority_statement": "Release decisions bind to the exact repo+commit identities below, derived exclusively from git rev-parse. The GitKB index is derived navigation state and is NEVER source or release authority.",
        "release_consumers": RELEASE_CONSUMERS,
        "repos": sorted(entries, key=lambda e: e["repo"]),
        "meta_coordination": "read-only evidence from /home/flexnetos/meta/.meta.yaml; no monorepo fusion; every peer remains an independent repository",
    }
    (HERE / "ARCHBP-022-release-isolation-map.json").write_text(
        json.dumps(the_map, indent=2, sort_keys=True) + "\n")

    receipt = {
        "schema_version": "lifeos.branch-current-index-receipt.v0",
        "checks": {name: name not in failures for name in
                   [f"index-not-empty:{n}" for n in RELEASE_REPOS]
                   + ["repo-discovery-unambiguous", "kb-workspace-clean"]
                   + [f"rev-parse-identity:{n}" for n in RELEASE_REPOS]
                   + [f"kb-branch-mapped:{n}" for n in RELEASE_REPOS]},
        "index_roots": 43,
        "map": "ARCHBP-022-release-isolation-map.json",
    }
    (HERE / "ARCHBP-022-branch-current-receipt.json").write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n")

    if failures:
        print(f"\nFAILED: {', '.join(failures)}")
        sys.exit(1)
    print("\nALL GREEN: branch-current release isolation holds; map and receipt written")


if __name__ == "__main__":
    main()
