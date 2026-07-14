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

# Receipt for proof_ledger.jsonl at origin/main ee71a506957b92767591b19b9048840c4d530cb5.
# The correction merge must append after these bytes, never regenerate or rewrite them.
ORIGIN_MAIN_LEDGER_PREFIX_COUNT = 240
ORIGIN_MAIN_LEDGER_PREFIX_SHA256 = (
    "61b69981cb911f1903b1ea2fbb5a9e03520a3086f481aa480730533bed237a02"
)
CORRECTION_COUNT = 68
CORRECTION_END_LEDGER_COUNT = ORIGIN_MAIN_LEDGER_PREFIX_COUNT + CORRECTION_COUNT
POST_CORRECTION_ENTRIES = [
    (309, "LPS-000", "5", "pass"),
    (310, "LPS-000", "6", "pass"),
    (311, "LPS-001", "5", "pass"),
    (312, "LPS-006", "6", "pass"),
    (313, "LPS-008", "5", "pass"),
    (314, "LPS-009", "4", "pass"),
    (315, "LPS-011", "5", "pass"),
]
POST_CORRECTION_LEDGER_COUNT = len(POST_CORRECTION_ENTRIES)
FINAL_LEDGER_COUNT = CORRECTION_END_LEDGER_COUNT + POST_CORRECTION_LEDGER_COUNT


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

    def test_origin_main_prefix_is_immutable_and_final_ledger_is_contiguous(self) -> None:
        raw_lines, entries = self.ledger_lines()

        self.assertEqual(len(entries), FINAL_LEDGER_COUNT)
        self.assertEqual(
            [entry["sequence"] for entry in entries],
            list(range(1, FINAL_LEDGER_COUNT + 1)),
        )
        prefix = b"".join(raw_lines[:ORIGIN_MAIN_LEDGER_PREFIX_COUNT])
        self.assertEqual(hashlib.sha256(prefix).hexdigest(), ORIGIN_MAIN_LEDGER_PREFIX_SHA256)

    def test_each_correction_targets_the_exact_latest_prior_ledger_record(self) -> None:
        _, entries = self.ledger_lines()
        prefix = entries[:ORIGIN_MAIN_LEDGER_PREFIX_COUNT]
        appended = entries[
            ORIGIN_MAIN_LEDGER_PREFIX_COUNT:CORRECTION_END_LEDGER_COUNT
        ]
        corrections = self.correction_records()

        self.assertEqual(len(corrections), CORRECTION_COUNT)
        correction_task_ids = [record["task_id"] for _, record in corrections]
        self.assertEqual(len(set(correction_task_ids)), CORRECTION_COUNT)

        prefix_by_task: dict[str, list[dict]] = {}
        for entry in prefix:
            prefix_by_task.setdefault(entry["task_id"], []).append(entry)

        appended_by_key = {
            (entry["task_id"], str(entry["revision"])): entry for entry in appended
        }
        self.assertEqual(len(appended_by_key), CORRECTION_COUNT)

        for path, correction in corrections:
            with self.subTest(task_id=correction["task_id"]):
                task_id = correction["task_id"]
                invalidates = correction["invalidates"]
                prior_entries = prefix_by_task.get(task_id, [])
                self.assertTrue(prior_entries, f"{task_id} has no prior ledger record")
                latest_prior = max(prior_entries, key=lambda entry: entry["sequence"])

                self.assertTrue(invalidates["ledger_accepted"])
                self.assertEqual(invalidates["ledger_sequence"], latest_prior["sequence"])
                self.assertEqual(str(invalidates["revision"]), str(latest_prior["revision"]))
                self.assertEqual(invalidates["proof_sha256"], latest_prior["proof_sha256"])
                self.assertEqual(invalidates["proof_uri"], latest_prior["proof_uri"])
                self.assertGreater(int(correction["revision"]), int(latest_prior["revision"]))

                appended_entry = appended_by_key[(task_id, str(correction["revision"]))]
                self.assertEqual(appended_entry["status"], "invalidated")
                self.assertEqual(
                    appended_entry["proof_uri"].removeprefix("planning-spine-v0/"),
                    path.relative_to(ROOT).as_posix(),
                )
                self.assertEqual(
                    appended_entry["proof_sha256"],
                    hashlib.sha256(path.read_bytes()).hexdigest(),
                )
                self.assertEqual(appended_entry["invalidates"], invalidates)

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

        post_correction = entries[CORRECTION_END_LEDGER_COUNT:]
        self.assertEqual(len(post_correction), POST_CORRECTION_LEDGER_COUNT)
        self.assertEqual(
            [
                (
                    entry["sequence"],
                    entry["task_id"],
                    str(entry["revision"]),
                    entry["status"],
                )
                for entry in post_correction
            ],
            POST_CORRECTION_ENTRIES,
        )

    def test_integrated_corpus_projects_the_corrected_lifecycle(self) -> None:
        _, entries = self.ledger_lines()
        corrections = self.correction_records()
        projection = update_status.status_projection(NORMALIZED_GRAPH_PATH, LEDGER_PATH)

        self.assertEqual(projection["ledger_entry_count"], FINAL_LEDGER_COUNT)
        self.assertEqual(
            projection["lifecycle_counts"],
            {
                "draft": 77,
                "blocked": 0,
                "ready": 0,
                "simulated": 0,
                "running": 1,
                "complete": 117,
                "rolled-back": 1,
            },
        )
        self.assertEqual(len(projection["invalidated_task_ids"]), CORRECTION_COUNT)
        self.assertEqual(
            set(projection["invalidated_task_ids"]),
            {record["task_id"] for _, record in corrections},
        )
        self.assertEqual(projection["running_task_ids"], ["GRAPH-001"])
        self.assertEqual(projection["rolled_back_task_ids"], ["LPS-025"])
        self.assertEqual(len(entries), FINAL_LEDGER_COUNT)


if __name__ == "__main__":
    unittest.main()
