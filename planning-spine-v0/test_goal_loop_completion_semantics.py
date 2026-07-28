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
SPEC = importlib.util.spec_from_file_location("goal_loop", SCRIPTS_DIR / "goal_loop.py")
assert SPEC is not None and SPEC.loader is not None
goal_loop = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = goal_loop
SPEC.loader.exec_module(goal_loop)


def row(task_id: str, *, depends_on: str = "") -> dict[str, str]:
    return {
        "task_id": task_id,
        "status": "pending",
        "depends_on": depends_on,
        "parallel_group": "test",
        "max_parallel": "4",
        "human_approval_required": "false",
    }


def full_lifecycle_proof(task_id: str) -> dict:
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


class GoalLoopCompletionSemanticsTests(unittest.TestCase):
    def test_drift_canary_runs_then_requires_full_lifecycle(self) -> None:
        drift = row("DRIFT")
        drift.update(
            {
                "needs_capability_probe": "true",
                "probe_class": "drift-canary",
                "completion_gate": "NOT evidence of implementation",
            }
        )
        dependent = row("REAL", depends_on="DRIFT")

        before_execution = goal_loop.compute([drift, dependent], [])
        self.assertIn(
            "DRIFT",
            {item["task_id"] for item in before_execution["dispatch_packets"]},
        )

        execution_only_proof = {
            "task_id": "DRIFT",
            "status": "completed",
            "actor": "json-task-runner",
            "verification_output": {
                "packet_execution_proven": True,
                "task_completion_proven": True,
                "implementation_scope": "not_claimed",
            },
        }
        after_execution = goal_loop.compute(
            [drift, dependent],
            [execution_only_proof],
        )

        self.assertEqual("blocked", after_execution["statuses"]["DRIFT"])
        blocked = {
            item["task_id"]: item
            for item in after_execution["blocked_tasks"]
        }
        self.assertEqual(
            "implementation completion not proven",
            blocked["DRIFT"]["reason"],
        )
        self.assertEqual(
            ["DRIFT"],
            blocked["REAL"]["dependencies"],
        )
        self.assertEqual(0, after_execution["complete_count"])

        after_lifecycle = goal_loop.compute(
            [drift, dependent],
            [full_lifecycle_proof("DRIFT")],
        )
        self.assertEqual("complete", after_lifecycle["statuses"]["DRIFT"])
        self.assertEqual(
            ["REAL"],
            [
                item["task_id"]
                for item in after_lifecycle["dispatch_packets"]
            ],
        )

    def test_unstructured_legacy_proof_cannot_complete_task(self) -> None:
        legacy = row("LEGACY")
        state = goal_loop.compute(
            [legacy],
            [
                {
                    "task_id": "LEGACY",
                    "status": "completed",
                    "actor": "legacy-agent",
                }
            ],
        )
        self.assertEqual("blocked", state["statuses"]["LEGACY"])
        self.assertEqual(0, state["complete_count"])

    def test_optional_task_is_runnable_and_real_proof_completes_it(self) -> None:
        optional = row("OPTIONAL")
        optional["status"] = "optional"
        before_execution = goal_loop.compute([optional], [])
        self.assertEqual(["OPTIONAL"], [
            item["task_id"]
            for item in before_execution["dispatch_packets"]
        ])

        proof = full_lifecycle_proof("OPTIONAL")
        after_execution = goal_loop.compute([optional], [proof])
        self.assertEqual("complete", after_execution["statuses"]["OPTIONAL"])
        self.assertEqual(1, after_execution["complete_count"])
        self.assertEqual(0, after_execution["pending_count"])


if __name__ == "__main__":
    unittest.main()
