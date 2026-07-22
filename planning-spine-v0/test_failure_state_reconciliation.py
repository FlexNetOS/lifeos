"""ARCHBP-034 red tests: when an upstream verification gate fails, every
projection stays mutually consistent — summaries never claim pass while the
structured result is fail or blocked, absent identities are represented
without fabricated None values, blocked proofs stay schema-shaped, and
recovery to pass comes only from new evidence.
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

SPINE = Path(__file__).resolve().parent
SCRIPTS = SPINE / "scripts"


def load_verify_lps_docs():
    spec = importlib.util.spec_from_file_location(
        "verify_lps_docs_failure", SCRIPTS / "verify-lps-docs.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FailureStateReconciliationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_verify_lps_docs()
        self.fixture = Path(tempfile.mkdtemp(prefix="lps-failure-fixture-"))
        for sub in ("schemas", "examples", "state", "proof_records"):
            shutil.copytree(SPINE / sub, self.fixture / sub)
        for doc in ("06_PROOF_LEDGER.md", "07_MVP_VERTICAL_SLICE.md"):
            shutil.copy2(SPINE / doc, self.fixture / doc)
        self.module.PKG_ROOT = self.fixture
        self.module.PROOF_RECORDS = self.fixture / "proof_records"

    def tearDown(self) -> None:
        shutil.rmtree(self.fixture, ignore_errors=True)

    def corrupt_authority(self, payload) -> None:
        path = self.fixture / "state/authority_integrity_report.json"
        report = json.loads(path.read_text())
        report.update(payload)
        path.write_text(json.dumps(report, indent=2) + "\n")

    # -- contradictory summaries ------------------------------------------

    def test_blocked_lps007_summary_never_claims_pass(self) -> None:
        self.corrupt_authority({"result": "fail"})
        status, checks, summary, _, _ = self.module.gate_lps_007()
        self.assertEqual(status, "blocked")
        self.assertEqual(checks["authority_integrity_report_result"], "fail")
        self.assertNotIn("result=pass", summary)
        self.assertNotIn("is the sole completion authority", summary)
        self.assertIn("blocked", summary.lower())

    def test_blocked_lps008_summary_never_claims_pass(self) -> None:
        path = self.fixture / "state/mvp_bundle_report.json"
        report = json.loads(path.read_text())
        report["result"] = "fail"
        path.write_text(json.dumps(report, indent=2) + "\n")
        status, checks, summary, _, _ = self.module.gate_lps_008()
        self.assertEqual(status, "blocked")
        self.assertEqual(checks["shipped_bundle_report_result"], "fail")
        self.assertNotIn("result=pass", summary)
        self.assertNotIn("all connect", summary)
        self.assertIn("blocked", summary.lower())

    # -- null-safe identity handling --------------------------------------

    def test_absent_identities_never_fabricate_none(self) -> None:
        self.corrupt_authority({"verifier_authority": {}})
        status, checks, summary, _, _ = self.module.gate_lps_007()
        self.assertEqual(status, "blocked")
        self.assertFalse(checks["executor_verifier_distinct"])
        self.assertNotIn("None", summary)
        self.assertIn("undeclared", summary.lower())

    # -- blocked proofs stay schema-shaped --------------------------------

    def test_blocked_proof_records_remain_schema_shaped(self) -> None:
        self.corrupt_authority({"result": "fail"})
        status, checks, summary, artifacts, checksums = self.module.gate_lps_007()
        proof = {
            "schema_version": self.module.SCHEMA_VERSION,
            "task_id": "LPS-007",
            "observed_at": "2026-07-21T00:00:00Z",
            "revision": 1,
            "status": status,
            "verification_gate": "test",
            "gate_result": checks,
            "proof_summary": summary,
            "artifact_paths": artifacts,
            "artifact_checksums": checksums,
        }
        round_tripped = json.loads(json.dumps(proof))
        self.assertEqual(round_tripped["status"], "blocked")
        self.assertNotIn("None", round_tripped["proof_summary"])

    # -- recovery only from new evidence ----------------------------------

    def test_recovery_restores_pass_only_from_new_evidence(self) -> None:
        self.corrupt_authority({"result": "fail"})
        blocked_status, _, blocked_summary, _, _ = self.module.gate_lps_007()
        self.assertEqual(blocked_status, "blocked")
        self.assertIn("blocked", blocked_summary.lower())
        # New evidence: the shipped authority report passes again.
        self.corrupt_authority({"result": "pass"})
        recovered_status, _, recovered_summary, _, _ = self.module.gate_lps_007()
        self.assertEqual(recovered_status, "pass")
        self.assertNotIn("blocked", recovered_summary.lower())
        self.assertNotIn("None", recovered_summary)


if __name__ == "__main__":
    unittest.main()
