#!/usr/bin/env python3
"""Focused regression tests for append-only proof invalidation corrections."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def load_script(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


merge_proofs = load_script("merge_proof_records", "merge-proof-records.py")
update_status = load_script("update_task_graph_status", "update-task-graph-status.py")


def invalidation_proof(task_id: str = "TASK-001", revision: int = 2) -> dict:
    return {
        "schema_version": "lifeos-planning-spine.proof-record.v0",
        "task_id": task_id,
        "observed_at": "2026-07-13T12:00:00Z",
        "revision": revision,
        "status": "invalidated",
        "verified_by": "agent.verifier",
        "verified_at": "2026-07-13T12:00:00Z",
        "restores_source_status": "Draft",
        "invalidation_reason": "The prior completion lacked required owner ratification.",
        "invalidates": {
            "revision": "1",
            "proof_uri": "proof_records/TASK-001.proof.json",
            "proof_sha256": "a" * 64,
            "ledger_accepted": True,
            "ledger_sequence": 7,
        },
    }


class MergeInvalidationTests(unittest.TestCase):
    def test_invalidated_proof_requires_revision_two_or_later(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "TASK-001-v1.proof.json"
            path.write_text(json.dumps(invalidation_proof(revision=1)), encoding="utf-8")

            with self.assertRaisesRegex(merge_proofs.MergeError, "revision 2 or later"):
                merge_proofs.load_proof_record(path)

    def test_invalidated_proof_requires_auditable_correction_fields(self) -> None:
        cases = (
            ("verified_by", None, "verified_by"),
            ("verified_at", "", "verified_at"),
            ("invalidation_reason", None, "invalidation_reason"),
            ("invalidates", None, "invalidates object"),
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for index, (field, replacement, expected_error) in enumerate(cases):
                proof = invalidation_proof()
                if replacement is None:
                    proof.pop(field)
                else:
                    proof[field] = replacement
                path = root / f"invalid-{index}.proof.json"
                path.write_text(json.dumps(proof), encoding="utf-8")
                with self.subTest(field=field):
                    with self.assertRaisesRegex(merge_proofs.MergeError, expected_error):
                        merge_proofs.load_proof_record(path)

    def test_merge_carries_invalidation_audit_fields_into_ledger(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            proof_dir = root / "corrections"
            proof_dir.mkdir()
            proof_path = proof_dir / "TASK-001-v2.proof.json"
            proof_path.write_text(json.dumps(invalidation_proof()), encoding="utf-8")
            ledger_path = root / "proof_ledger.jsonl"
            report_path = root / "merge_report.json"

            report = merge_proofs.merge_records(proof_dir, ledger_path, report_path, False)
            entry = json.loads(ledger_path.read_text(encoding="utf-8"))

            self.assertEqual(report["appended_entry_count"], 1)
            self.assertEqual(entry["status"], "invalidated")
            self.assertEqual(entry["verified_by"], "agent.verifier")
            self.assertEqual(entry["verified_at"], "2026-07-13T12:00:00Z")
            self.assertEqual(entry["restores_source_status"], "Draft")
            self.assertEqual(entry["invalidates"]["ledger_sequence"], 7)


class StatusInvalidationTests(unittest.TestCase):
    def test_invalidated_latest_proof_falls_back_to_source_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            graph_path = root / "task_graph.normalized.json"
            ledger_path = root / "proof_ledger.jsonl"
            graph_path.write_text(
                json.dumps(
                    {
                        "schema_version": "lifeos-planning-spine.task-graph.normalized.v0",
                        "tasks": [
                            {
                                "task_id": "TASK-DRAFT",
                                "source_row_number": 2,
                                "status": "Draft",
                                "proof_uri": "proof_records/TASK-DRAFT.proof.json",
                                "next_action": "Await owner ratification.",
                                "parent_ids": [],
                            },
                            {
                                "task_id": "TASK-RUNNING",
                                "source_row_number": 3,
                                "status": "Running",
                                "proof_uri": "proof_records/TASK-RUNNING.proof.json",
                                "next_action": "Continue verified graph work.",
                                "parent_ids": [],
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            entries = []
            for sequence, task_id, restored in (
                (1, "TASK-DRAFT", "Draft"),
                (2, "TASK-RUNNING", "Running"),
            ):
                entries.append(
                    {
                        "schema_version": "lifeos-planning-spine.proof-ledger.v0",
                        "sequence": sequence,
                        "task_id": task_id,
                        "status": "invalidated",
                        "observed_at": "2026-07-13T12:00:00Z",
                        "revision": "2",
                        "proof_uri": f"proof_records/corrections/{task_id}-v2.proof.json",
                        "proof_sha256": "b" * 64,
                        "restores_source_status": restored,
                        "invalidates": {"revision": "1"},
                    }
                )
            ledger_path.write_text(
                "".join(json.dumps(entry) + "\n" for entry in entries), encoding="utf-8"
            )

            projection = update_status.status_projection(graph_path, ledger_path)
            tasks = {task["task_id"]: task for task in projection["tasks"]}

            self.assertEqual(projection["invalidated_task_ids"], ["TASK-DRAFT", "TASK-RUNNING"])
            self.assertEqual(projection["lifecycle_counts"]["draft"], 1)
            self.assertEqual(projection["lifecycle_counts"]["running"], 1)
            self.assertEqual(tasks["TASK-DRAFT"]["effective"]["status"], "Draft")
            self.assertEqual(tasks["TASK-RUNNING"]["effective"]["status"], "Running")
            self.assertEqual(tasks["TASK-DRAFT"]["proof"]["status"], "invalidated")
            self.assertEqual(tasks["TASK-DRAFT"]["proof"]["invalidates"], {"revision": "1"})

    def test_invalidated_proof_cannot_claim_a_different_source_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            graph_path = root / "task_graph.normalized.json"
            ledger_path = root / "proof_ledger.jsonl"
            graph_path.write_text(
                json.dumps(
                    {
                        "schema_version": "lifeos-planning-spine.task-graph.normalized.v0",
                        "tasks": [
                            {
                                "task_id": "TASK-001",
                                "source_row_number": 2,
                                "status": "Draft",
                                "proof_uri": "proof_records/TASK-001.proof.json",
                                "next_action": "Await evidence.",
                                "parent_ids": [],
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            ledger_path.write_text(
                json.dumps(
                    {
                        "schema_version": "lifeos-planning-spine.proof-ledger.v0",
                        "sequence": 1,
                        "task_id": "TASK-001",
                        "status": "invalidated",
                        "observed_at": "2026-07-13T12:00:00Z",
                        "revision": "2",
                        "proof_uri": "proof_records/corrections/TASK-001-v2.proof.json",
                        "proof_sha256": "b" * 64,
                        "restores_source_status": "Running",
                        "invalidates": {"revision": "1"},
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(update_status.StatusError, "does not match source status"):
                update_status.status_projection(graph_path, ledger_path)


if __name__ == "__main__":
    unittest.main()
