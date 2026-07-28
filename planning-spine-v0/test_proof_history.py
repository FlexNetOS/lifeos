from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPTS_DIR = (
    Path(__file__).parent
    / "envctl-db-nu-plugin-migration-automation-package"
    / "execution-framework"
    / "scripts"
)
sys.path.insert(0, str(SCRIPTS_DIR))
SPEC = importlib.util.spec_from_file_location("proof_common", SCRIPTS_DIR / "_common.py")
assert SPEC is not None and SPEC.loader is not None
common = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = common
SPEC.loader.exec_module(common)


class ProofHistoryTests(unittest.TestCase):
    def test_append_proof_preserves_prior_record_and_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            execution_root = Path(temporary) / "execution-framework"
            package_root = execution_root.parent
            first = {
                "task_id": "VER-304",
                "status": "completed",
                "verification_output": {"task_completion_proven": True},
            }
            second = {
                "task_id": "VER-304",
                "status": "failed",
                "verification_output": {"task_completion_proven": False},
            }

            with (
                patch.object(common, "root", return_value=execution_root),
                patch.object(common, "package_root", return_value=package_root),
            ):
                common.append_proof(first)
                proof_path = execution_root / "proof_records" / "VER-304.proof.json"
                first_payload = proof_path.read_bytes()
                common.append_proof(second)
                common.append_proof(second)

            ledger = execution_root / "proof_records" / "proof_ledger.jsonl"
            records = [
                json.loads(line)
                for line in ledger.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual([first, second], records)
            self.assertEqual(
                second,
                json.loads(proof_path.read_text(encoding="utf-8")),
            )
            history = (
                execution_root
                / "proof_records"
                / "history"
                / "VER-304"
                / f"{hashlib.sha256(first_payload).hexdigest()}.proof.json"
            )
            self.assertEqual(first_payload, history.read_bytes())


if __name__ == "__main__":
    unittest.main()
