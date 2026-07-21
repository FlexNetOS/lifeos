#!/usr/bin/env python3
"""Regression tests for append-only duplicate revision conflict resolution."""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / "scripts"
FIXTURES = ROOT / "proof_records" / "fixtures" / "duplicate-revision-digest"
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


class ProofLedgerConflictTests(unittest.TestCase):
    def test_live_resolution_set_covers_all_observed_conflicts(self) -> None:
        resolution_path = (
            ROOT
            / "proof_records"
            / "corrections"
            / "proof-ledger-conflict-resolutions-2026-07-14"
            / "resolutions.json"
        )
        resolutions = json.loads(resolution_path.read_text(encoding="utf-8"))["resolutions"]
        self.assertEqual(len(resolutions), 18)
        self.assertEqual(
            len({(item["task_id"], str(item["revision"])) for item in resolutions}),
            18,
        )

    def test_unresolved_duplicate_revision_is_rejected(self) -> None:
        ledger = FIXTURES / "unresolved.ledger.jsonl"
        with self.assertRaisesRegex(merge.MergeError, "unresolved ledger conflict"):
            merge.load_ledger(ledger)
        with self.assertRaisesRegex(status.StatusError, "unresolved proof-ledger conflict"):
            status.load_latest_ledger(ledger)

    def test_all_readers_select_the_append_only_accepted_digest(self) -> None:
        ledger = FIXTURES / "resolved.ledger.jsonl"
        entries, index = merge.load_ledger(ledger)
        self.assertEqual(len(entries), 3)
        self.assertEqual(
            index[("GRAPH-005", "1")].proof_sha256,
            "e991b760e43417667dc47c45131be4c50f74aaa9d15c28270feee6393b666efa",
        )
        _, latest = status.load_latest_ledger(ledger)
        self.assertEqual(
            latest["GRAPH-005"]["proof_sha256"],
            "e991b760e43417667dc47c45131be4c50f74aaa9d15c28270feee6393b666efa",
        )

    def test_committed_ledger_has_no_unresolved_conflicts(self) -> None:
        ledger = ROOT / "proof_records" / "proof_ledger.jsonl"
        analysis = merge.analyze_ledger(ledger)
        self.assertEqual(analysis.errors, [])
        self.assertEqual(analysis.unresolved_conflicts, [])
        self.assertGreaterEqual(len(analysis.resolved_conflicts), 18)
        self.assertGreaterEqual(analysis.max_sequence, 278)
        self.assertEqual(
            analysis.effective_index[("GRAPH-005", "1")].proof_sha256,
            "e991b760e43417667dc47c45131be4c50f74aaa9d15c28270feee6393b666efa",
        )


if __name__ == "__main__":
    unittest.main()
