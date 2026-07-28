from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPTS_DIR = (
    Path(__file__).parent
    / "envctl-db-nu-plugin-migration-automation-package"
    / "execution-framework"
    / "scripts"
)
sys.path.insert(0, str(SCRIPTS_DIR))
SPEC = importlib.util.spec_from_file_location(
    "verify_history_and_completeness",
    SCRIPTS_DIR / "verify_history_and_completeness.py",
)
assert SPEC is not None and SPEC.loader is not None
verifier = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = verifier
SPEC.loader.exec_module(verifier)

VER304_SPEC = importlib.util.spec_from_file_location(
    "verify_ver304_final_completeness",
    SCRIPTS_DIR / "verify_ver304_final_completeness.py",
)
assert VER304_SPEC is not None and VER304_SPEC.loader is not None
ver304 = importlib.util.module_from_spec(VER304_SPEC)
sys.modules[VER304_SPEC.name] = ver304
VER304_SPEC.loader.exec_module(ver304)


def full_lifecycle_proof(task_id: str = "CAPABILITY") -> dict:
    return {
        "task_id": task_id,
        "status": "completed",
        "actor": "json-task-runner",
        "verification_output": {
            "packet_execution_proven": True,
            "task_completion_proven": True,
            "implementation_scope": "full_lifecycle_completed",
            "lifecycle": {
                "stage": "completed",
                "implementation_proven": True,
                "independent_verification_proven": True,
                "activation_proven": True,
                "adopted": True,
            },
        },
    }


class FinalCompletionSemanticsTests(unittest.TestCase):
    def test_drift_packet_is_an_unresolved_implementation_obligation(self) -> None:
        reason = verifier.packet_implementation_obligation(
            {
                "needs_capability_probe": True,
                "probe_class": "drift-canary",
                "completion_gate": "NOT evidence of implementation",
            }
        )

        self.assertIsNotNone(reason)
        self.assertIn("needs_capability_probe", reason)
        self.assertIn("drift-canary", reason)

    def test_execution_only_proof_cannot_satisfy_final_completion(self) -> None:
        reason = verifier.proof_completion_blocker(
            {
                "task_id": "DRIFT",
                "status": "completed",
                "actor": "json-task-runner",
                "verification_output": {
                    "packet_execution_proven": True,
                    "task_completion_proven": False,
                    "implementation_scope": "not_claimed",
                },
            }
        )

        self.assertIsNotNone(reason)

    def test_verified_capability_proof_is_accepted(self) -> None:
        reason = verifier.proof_completion_blocker(full_lifecycle_proof())

        self.assertIsNone(reason)

    def test_unstructured_legacy_completion_is_rejected(self) -> None:
        reason = verifier.proof_completion_blocker(
            {
                "task_id": "LEGACY",
                "status": "completed",
                "actor": "legacy-agent",
            }
        )
        self.assertIsNotNone(reason)

    def test_full_lifecycle_resolves_drift_packet_obligation(self) -> None:
        packet = {
            "task_id": "DRIFT",
            "needs_capability_probe": True,
            "probe_class": "drift-canary",
            "completion_gate": "NOT evidence of implementation",
        }
        self.assertIsNotNone(
            verifier.unresolved_packet_implementation_obligation(packet, None)
        )
        self.assertIsNone(
            verifier.unresolved_packet_implementation_obligation(
                packet,
                full_lifecycle_proof("DRIFT"),
            )
        )

    def test_external_blocker_is_never_terminal_success(self) -> None:
        self.assertEqual("blocked", verifier.final_status(True, [{"id": "EXT"}]))
        self.assertEqual("pass", verifier.final_status(True, []))
        self.assertEqual("failed", verifier.final_status(False, []))
        self.assertEqual({"pass"}, ver304.ALLOWED_FINAL_STATUSES)


if __name__ == "__main__":
    unittest.main()
