#!/usr/bin/env python3
"""Focused regression tests for append-only proof invalidation corrections."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

LEDGER_PATH = ROOT / "proof_records" / "proof_ledger.jsonl"
CORRECTION_DIR = (
    ROOT
    / "proof_records"
    / "corrections"
    / "architecture-blueprint-owner-ratification-2026-07-13"
)
NORMALIZED_GRAPH_PATH = ROOT / "generated" / "task_graph.normalized.json"

# The historical correction branch's ledger prefix is not the active ledger:
# a later source-of-truth commit changed records within that prefix. Each
# retained correction therefore carries its own historical target receipt.
HISTORICAL_CORRECTION_PREFIX_COUNT = 240
CORRECTION_COUNT = 68
ACTIVE_PRE_CONSOLIDATION_PREFIX_COUNT = 258
ACTIVE_PRE_CONSOLIDATION_PREFIX_SHA256 = (
    "99ac837e5878972069fa679fed21f870d8487967e89ea45eb7eb04b1f4d2b6cf"
)
CONSOLIDATION_ENTRIES = [
    (259, "ARCHBP-035", "1", "pass"),
    (260, "STORE-001", "2", "pass"),
]
CONFLICT_RESOLUTION_COUNT = 18
ACTIVE_LEDGER_COUNT = (
    ACTIVE_PRE_CONSOLIDATION_PREFIX_COUNT
    + len(CONSOLIDATION_ENTRIES)
    + CONFLICT_RESOLUTION_COUNT
)


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


class IntegratedCorrectionCorpusTests(unittest.TestCase):
    @staticmethod
    def ledger_lines() -> tuple[list[bytes], list[dict]]:
        raw_lines = LEDGER_PATH.read_bytes().splitlines(keepends=True)
        entries = [json.loads(line) for line in raw_lines]
        return raw_lines, entries

    @staticmethod
    def correction_records() -> list[tuple[Path, dict]]:
        paths = sorted(CORRECTION_DIR.glob("*.proof.json"))
        return [(path, json.loads(path.read_text(encoding="utf-8"))) for path in paths]

    def test_active_prefix_is_immutable_and_final_ledger_is_contiguous(self) -> None:
        raw_lines, entries = self.ledger_lines()

        # The ledger is append-only: the historical prefix, consolidation
        # block, and conflict-resolution block are frozen byte-for-byte, while
        # later entries may legitimately accumulate after them.
        self.assertGreaterEqual(len(entries), ACTIVE_LEDGER_COUNT)
        self.assertEqual(
            [entry["sequence"] for entry in entries],
            list(range(1, len(entries) + 1)),
        )
        prefix = b"".join(raw_lines[:ACTIVE_PRE_CONSOLIDATION_PREFIX_COUNT])
        self.assertEqual(
            hashlib.sha256(prefix).hexdigest(), ACTIVE_PRE_CONSOLIDATION_PREFIX_SHA256
        )
        tail = entries[ACTIVE_PRE_CONSOLIDATION_PREFIX_COUNT:]
        self.assertEqual(
            [
                (entry["sequence"], entry["task_id"], str(entry["revision"]), entry["status"])
                for entry in tail[: len(CONSOLIDATION_ENTRIES)]
            ],
            CONSOLIDATION_ENTRIES,
        )
        resolution_entries = tail[
            len(CONSOLIDATION_ENTRIES) : len(CONSOLIDATION_ENTRIES) + CONFLICT_RESOLUTION_COUNT
        ]
        self.assertEqual(len(resolution_entries), CONFLICT_RESOLUTION_COUNT)
        self.assertEqual(
            [entry["sequence"] for entry in resolution_entries],
            list(range(261, ACTIVE_LEDGER_COUNT + 1)),
        )
        self.assertTrue(
            all(entry["status"] == "conflict-resolved" for entry in resolution_entries)
        )

    def test_historical_corrections_retain_target_receipts_but_are_not_active(self) -> None:
        _, entries = self.ledger_lines()
        corrections = self.correction_records()

        self.assertEqual(len(corrections), CORRECTION_COUNT)
        correction_task_ids = [record["task_id"] for _, record in corrections]
        self.assertEqual(len(set(correction_task_ids)), CORRECTION_COUNT)

        active_uris = {entry["proof_uri"].removeprefix("planning-spine-v0/") for entry in entries}

        for path, correction in corrections:
            with self.subTest(task_id=correction["task_id"]):
                task_id = correction["task_id"]
                invalidates = correction["invalidates"]
                self.assertTrue(invalidates["ledger_accepted"])
                self.assertIn(
                    invalidates["ledger_hash_matches_observed_bytes"], (True, False)
                )
                self.assertLessEqual(
                    invalidates["ledger_sequence"], HISTORICAL_CORRECTION_PREFIX_COUNT
                )
                self.assertGreater(invalidates["ledger_sequence"], 0)
                self.assertRegex(invalidates["proof_sha256"], r"^[0-9a-f]{64}$")
                self.assertTrue(invalidates["proof_uri"].endswith(".proof.json"))
                self.assertGreater(
                    int(correction["revision"]), int(invalidates["revision"])
                )
                self.assertNotIn(path.relative_to(ROOT).as_posix(), active_uris)

        graph_correction_path = CORRECTION_DIR / "GRAPH-005-v4.proof.json"
        self.assertTrue(graph_correction_path.is_file())
        graph_correction = json.loads(graph_correction_path.read_text(encoding="utf-8"))
        self.assertEqual(graph_correction["revision"], 4)
        self.assertEqual(
            graph_correction["invalidates"],
            {
                "ledger_accepted": True,
                "ledger_hash_matches_observed_bytes": True,
                "ledger_sequence": 238,
                "observed_proof_sha256": (
                    "5e1e788a6a07d86bd1a8a630ef3bb130be26f64537bc50c97d663b24baabfe49"
                ),
                "original_proof_uri": "proof_records/GRAPH-005.proof.json",
                "proof_sha256": (
                    "5e1e788a6a07d86bd1a8a630ef3bb130be26f64537bc50c97d663b24baabfe49"
                ),
                "proof_uri": "proof_records/GRAPH-005.proof.json",
                "revision": "3",
            },
        )

    def test_current_projection_uses_owner_ratified_store_proof(self) -> None:
        _, entries = self.ledger_lines()
        projection = update_status.status_projection(NORMALIZED_GRAPH_PATH, LEDGER_PATH)

        self.assertGreaterEqual(projection["ledger_entry_count"], ACTIVE_LEDGER_COUNT)
        self.assertEqual(projection["ledger_entry_count"], len(entries))
        self.assertEqual(
            projection["lifecycle_counts"],
            {
                "draft": 0,
                "blocked": 19,
                "ready": 16,
                "simulated": 0,
                "running": 0,
                "complete": 209,
                "rolled-back": 0,
            },
        )
        self.assertEqual(projection["invalidated_task_ids"], [])
        tasks = {task["task_id"]: task for task in projection["tasks"]}
        self.assertEqual(tasks["STORE-001"]["proof"]["revision"], "2")
        self.assertEqual(tasks["STORE-001"]["proof"]["status"], "pass")
        self.assertEqual(tasks["STORE-001"]["effective"]["status"], "complete")
        self.assertGreaterEqual(len(entries), ACTIVE_LEDGER_COUNT)


if __name__ == "__main__":
    unittest.main()
