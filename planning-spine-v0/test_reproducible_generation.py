from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from reproducible_time import utc_now  # noqa: E402


def load_verify_lps_docs():
    spec = importlib.util.spec_from_file_location("verify_lps_docs", SCRIPTS / "verify-lps-docs.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load verify-lps-docs.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ReproducibleGenerationTest(unittest.TestCase):
    def test_source_date_epoch_controls_generator_time(self) -> None:
        with patch.dict(os.environ, {"SOURCE_DATE_EPOCH": "0"}):
            self.assertEqual(utc_now(), "1970-01-01T00:00:00Z")

    def test_source_date_epoch_rejects_invalid_values(self) -> None:
        with patch.dict(os.environ, {"SOURCE_DATE_EPOCH": "invalid"}):
            with self.assertRaisesRegex(ValueError, "must be an integer"):
                utc_now()

    def test_proof_regeneration_is_idempotent_and_monotonic(self) -> None:
        verifier = load_verify_lps_docs()
        existing = {
            "task_id": "LPS-000",
            "observed_at": "2026-07-12T00:00:00Z",
            "revision": 3,
            "status": "pass",
            "checksums": {"README.md": "old"},
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            proof_path = Path(temp_dir) / "LPS-000.proof.json"
            proof_path.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
            original_bytes = proof_path.read_bytes()

            identical = {**existing, "observed_at": "2026-07-13T00:00:00Z", "revision": 1}
            verifier.write_monotonic_proof(proof_path, identical)
            self.assertEqual(proof_path.read_bytes(), original_bytes)

            changed = {
                **identical,
                "checksums": {"README.md": "new"},
            }
            verifier.write_monotonic_proof(proof_path, changed)
            regenerated = json.loads(proof_path.read_text(encoding="utf-8"))
            self.assertEqual(regenerated["revision"], 4)
            self.assertEqual(regenerated["checksums"]["README.md"], "new")

    def test_proof_revision_clears_ledger_floor(self) -> None:
        # The append-only ledger can hold revisions above the on-disk proof
        # (a graph restructure reset proof files to revision 1); a re-heal
        # must bump past the ledger's max or the merger rejects the record
        # as a same-revision digest conflict.
        verifier = load_verify_lps_docs()
        existing = {
            "task_id": "LPS-000",
            "observed_at": "2026-07-12T00:00:00Z",
            "revision": 1,
            "status": "pass",
            "checksums": {"README.md": "old"},
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            proof_path = Path(temp_dir) / "LPS-000.proof.json"
            proof_path.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")

            changed = {**existing, "checksums": {"README.md": "new"}}
            verifier.write_monotonic_proof(proof_path, changed, ledger_floor=3)
            regenerated = json.loads(proof_path.read_text(encoding="utf-8"))
            self.assertEqual(regenerated["revision"], 4)

            ledger_path = Path(temp_dir) / "ledger.jsonl"
            ledger_path.write_text(
                json.dumps({"task_id": "LPS-000", "revision": "3"})
                + "\n"
                + json.dumps({"task_id": "LPS-000", "revision": 2})
                + "\n"
                + json.dumps({"task_id": "LPS-001", "revision": 5})
                + "\n",
                encoding="utf-8",
            )
            self.assertEqual(
                verifier.ledger_max_revisions(ledger_path),
                {"LPS-000": 3, "LPS-001": 5},
            )


if __name__ == "__main__":
    unittest.main()
