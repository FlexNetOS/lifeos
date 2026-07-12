"""Failing-first validator for PRESERVE-002/003 definition artifacts.

Gates checked:
- PRESERVE-002: generated/preserve_provenance_baselines.csv has exactly one row
  per live .git peer under /home/flexnetos/meta/src/, and every row carries
  provenance (remote, HEAD), capability boundary, baseline command, expected
  output, dependency edges, and a no-loss parity gate (all non-empty).
- PRESERVE-003: generated/preserve_topology_reconciliation.md references all six
  STRUCTURE receipts, the post-receipt lifeos peer-namespace move (meta PR #101),
  and the /home/flexnetos/lifeos/src/envctl regression.
- Both proof records parse, follow the NBSOURCE-001 schema shape, and their
  artifact paths exist.
"""

import csv
import json
import subprocess
from pathlib import Path

SPINE = Path("/home/flexnetos/meta/src/lifeos/planning-spine-v0")
CSV_PATH = SPINE / "generated" / "preserve_provenance_baselines.csv"
MD_PATH = SPINE / "generated" / "preserve_topology_reconciliation.md"
P2 = SPINE / "proof_records" / "PRESERVE-002.proof.json"
P3 = SPINE / "proof_records" / "PRESERVE-003.proof.json"
SRC = Path("/home/flexnetos/meta/src")

REQUIRED_COLS = [
    "peer_id", "repo_path", "git_kind", "remote_origin_url", "head_commit",
    "branch", "worktree_state", "capability_boundary", "license",
    "dependency_edges", "baseline_verification_command", "expected_output",
    "last_verified_evidence", "no_loss_parity_gate",
]


def live_peers():
    return sorted(
        d.name for d in SRC.iterdir()
        if d.is_dir() and (d / ".git").exists()
    )


def test_provenance_csv_exists_and_covers_all_peers():
    assert CSV_PATH.exists(), f"missing {CSV_PATH}"
    with CSV_PATH.open() as f:
        rows = list(csv.DictReader(f))
    for col in REQUIRED_COLS:
        assert col in rows[0], f"missing column {col}"
    csv_peers = sorted(r["peer_id"] for r in rows)
    assert csv_peers == live_peers(), (
        f"peer set mismatch: csv-only={set(csv_peers) - set(live_peers())} "
        f"disk-only={set(live_peers()) - set(csv_peers)}"
    )
    for r in rows:
        for col in REQUIRED_COLS:
            assert r[col].strip(), f"{r['peer_id']}: empty {col}"
        assert len(r["head_commit"]) == 40, f"{r['peer_id']}: bad head_commit"


def test_provenance_csv_head_commits_are_current():
    with CSV_PATH.open() as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        head = subprocess.run(
            ["git", "-C", r["repo_path"], "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        assert head == r["head_commit"], f"{r['peer_id']}: stale HEAD in csv"


def test_topology_reconciliation_md():
    assert MD_PATH.exists(), f"missing {MD_PATH}"
    text = MD_PATH.read_text()
    for receipt in [
        "structure_meta_root_rename_receipt.json",
        "structure_lifeos_relocation_receipt.json",
        "structure_meta_root_promotion_receipt.json",
        "structure_meta_collision_diff.json",
        "structure_meta_fleet_ownership.json",
        "structure_worktree_repair_receipt.json",
        "structure_acceptance_report.json",
    ]:
        assert receipt in text, f"reconciliation missing receipt {receipt}"
    for sid in ["STRUCTURE-001", "STRUCTURE-002", "STRUCTURE-003",
                "STRUCTURE-004", "STRUCTURE-005", "STRUCTURE-006"]:
        assert sid in text, f"reconciliation missing {sid}"
    assert "/home/flexnetos/lifeos/src/envctl" in text, "envctl regression missing"
    assert "#101" in text or "PR 101" in text, "peer-namespace move (PR #101) missing"
    assert "src/lifeos" in text, "current lifeos path missing"


def test_proof_records():
    for path, task in [(P2, "PRESERVE-002"), (P3, "PRESERVE-003")]:
        assert path.exists(), f"missing {path}"
        doc = json.loads(path.read_text())
        assert doc["schema_version"] == "lifeos-planning-spine.proof-record.v0"
        assert doc["task_id"] == task
        assert doc["status"] in ("pass", "partial", "fail")
        assert doc["verification_gate"].strip()
        assert isinstance(doc["gate_result"], dict) and doc["gate_result"]
        for ap in doc.get("artifact_paths", []):
            p = Path(ap)
            if not p.is_absolute():
                p = SPINE.parent / ap
            assert p.exists(), f"{task}: artifact path missing {ap}"
