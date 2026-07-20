#!/usr/bin/env python3
"""Regression tests for append-only duplicate revision conflict resolution."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))


def load_script(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


merge = load_script("merge_proof_conflict", "merge-proof-records.py")
status = load_script("status_proof_conflict", "update-task-graph-status.py")


def ledger_entry(sequence: int, digest: str) -> dict:
    return {
        "schema_version": "lifeos-planning-spine.proof-ledger.v0",
        "sequence": sequence,
        "task_id": "GRAPH-005",
        "status": "pass",
        "observed_at": "2026-07-13T03:47:08Z",
        "revision": "1",
        "proof_uri": "proof_records/GRAPH-005.proof.json",
        "proof_sha256": digest,
    }


def resolution_proof(first: str, second: str) -> dict:
    return {
        "schema_version": "lifeos-planning-spine.proof-record.v0",
        "task_id": "ARCHBP-035",
        "observed_at": "2026-07-20T00:00:00Z",
        "revision": 1,
        "status": "pass",
        "verification_gate": "Resolve duplicate revision identities without rewriting ledger history.",
        "ledger_conflict_resolution": {
            "conflict_id": "GRAPH-005-REVISION-1",
            "subject_task_id": "GRAPH-005",
            "revision": "1",
            "verified_by": "Independent Verifier",
            "verified_at": "2026-07-20T00:00:00Z",
            "reason": "The later digest matches the current accepted proof artifact; the earlier byte remains historical.",
            "entries": [
                {"ledger_sequence": 1, "proof_sha256": first, "disposition": "superseded-historical"},
                {"ledger_sequence": 2, "proof_sha256": second, "disposition": "accepted-current"},
            ],
        },
    }


class ProofLedgerConflictTests(unittest.TestCase):
    def test_live_resolution_set_covers_all_observed_conflicts(self) -> None:
        record = merge.load_proof_record(ROOT / "proof_records" / "ARCHBP-035.proof.json")
        self.assertEqual(len(record.ledger_conflict_resolutions), 18)
        self.assertEqual(
            len({(item["subject_task_id"], item["revision"]) for item in record.ledger_conflict_resolutions}),
            18,
        )

    def test_unresolved_duplicate_revision_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "ledger.jsonl"
            ledger.write_text(
                json.dumps(ledger_entry(1, "a" * 64)) + "\n"
                + json.dumps(ledger_entry(2, "b" * 64)) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(merge.MergeError, "unresolved conflicting ledger entries"):
                merge.load_ledger(ledger)
            with self.assertRaisesRegex(status.StatusError, "unresolved conflicting ledger entries"):
                status.load_latest_ledger(ledger)

    def test_resolution_appends_without_rewriting_and_all_readers_select_accepted_digest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ledger = root / "ledger.jsonl"
            prefix = (
                json.dumps(ledger_entry(1, "a" * 64)) + "\n"
                + json.dumps(ledger_entry(2, "b" * 64)) + "\n"
            ).encode()
            ledger.write_bytes(prefix)
            proof_dir = root / "proofs"
            proof_dir.mkdir()
            proof = proof_dir / "ARCHBP-035.proof.json"
            proof.write_text(json.dumps(resolution_proof("a" * 64, "b" * 64)), encoding="utf-8")

            report = merge.merge_records(proof_dir, ledger, root / "report.json", False)
            self.assertEqual(report["appended_entry_count"], 1)
            self.assertEqual(ledger.read_bytes()[: len(prefix)], prefix)
            self.assertEqual(hashlib.sha256(prefix).hexdigest(), hashlib.sha256(ledger.read_bytes()[: len(prefix)]).hexdigest())

            entries, index = merge.load_ledger(ledger)
            self.assertEqual(len(entries), 3)
            self.assertEqual(index[("GRAPH-005", "1")].proof_sha256, "b" * 64)
            _, latest = status.load_latest_ledger(ledger)
            self.assertEqual(latest["GRAPH-005"]["proof_sha256"], "b" * 64)


if __name__ == "__main__":
    unittest.main()
