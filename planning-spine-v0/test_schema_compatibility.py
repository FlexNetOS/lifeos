#!/usr/bin/env python3
"""Regression tests for versioned task/proof contracts and YZXCONV landing."""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import sys
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_script(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


build_coverage = load_script("build_coverage_control", "build-coverage-control.py")


class VersionedSchemaCompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.domain_task_validator = Draft202012Validator(
            read_json(ROOT / "schemas" / "task.schema.json")
        )
        cls.operational_task_validator = Draft202012Validator(
            read_json(ROOT / "schemas" / "task-graph-row.schema.json")
        )
        cls.domain_proof_validator = Draft202012Validator(
            read_json(ROOT / "schemas" / "proof-record.schema.json")
        )
        cls.operational_proof_validator = Draft202012Validator(
            read_json(ROOT / "schemas" / "proof-ledger-record.schema.json")
        )

    def assert_valid(self, validator: Draft202012Validator, value: dict, label: str) -> None:
        errors = sorted(validator.iter_errors(value), key=lambda error: list(error.absolute_path))
        self.assertEqual(errors, [], f"{label}: {[error.message for error in errors]}")

    def test_domain_examples_and_operational_artifacts_use_their_own_schemas(self) -> None:
        domain_task = read_json(ROOT / "examples" / "task.json")
        domain_proof = read_json(ROOT / "examples" / "proof-record.json")
        canonical_graph = read_json(ROOT / "generated" / "task_graph.normalized.json")
        operational_task = next(
            task for task in canonical_graph["tasks"] if task["task_id"] == "YZXCONV-001"
        )
        operational_proof = read_json(ROOT / "proof_records" / "YZXCONV-001.proof.json")

        self.assert_valid(self.domain_task_validator, domain_task, "domain Task example")
        self.assert_valid(self.domain_proof_validator, domain_proof, "domain ProofRecord example")
        self.assert_valid(
            self.operational_task_validator,
            operational_task,
            "operational task graph row",
        )
        self.assert_valid(
            self.operational_proof_validator,
            operational_proof,
            "operational proof ledger input",
        )

        self.assertFalse(self.operational_task_validator.is_valid(domain_task))
        self.assertFalse(self.domain_task_validator.is_valid(operational_task))
        self.assertFalse(self.operational_proof_validator.is_valid(domain_proof))
        self.assertFalse(self.domain_proof_validator.is_valid(operational_proof))

    def test_every_generated_task_and_proof_validates_operationally(self) -> None:
        for graph_path in (
            ROOT / "generated" / "task_graph.normalized.json",
            ROOT / "yazelix_runtime_convergence" / "generated" / "task_graph.normalized.json",
        ):
            graph = read_json(graph_path)
            for task in graph["tasks"]:
                self.assert_valid(
                    self.operational_task_validator,
                    task,
                    f"{graph_path}:{task.get('task_id')}",
                )

        proof_paths = sorted((ROOT / "proof_records").rglob("*.proof.json"))
        self.assertGreater(len(proof_paths), 200)
        for proof_path in proof_paths:
            self.assert_valid(
                self.operational_proof_validator,
                read_json(proof_path),
                str(proof_path),
            )


class YazelixConvergenceLandingTests(unittest.TestCase):
    def test_focused_rows_are_exact_canonical_projection(self) -> None:
        focused = read_csv(ROOT / "yazelix_runtime_convergence" / "task_graph.source.csv")
        canonical = [
            row
            for row in read_csv(ROOT / "generated" / "task_graph.source.csv")
            if row["task_id"].startswith("YZXCONV-")
        ]
        self.assertEqual(len(focused), 15)
        self.assertEqual(canonical, focused)
        self.assertEqual(focused[0]["parent_id"], "LPS-003")

    def test_coverage_control_is_current_and_yzx_tasks_are_anchored(self) -> None:
        coverage_path = ROOT / "generated" / "north_star_coverage.source.csv"
        graph_path = ROOT / "generated" / "task_graph.normalized.json"
        expected = build_coverage.build_control(coverage_path, graph_path)
        actual = read_json(ROOT / "generated" / "north_star_coverage.control.json")
        self.assertEqual(actual, expected)

        yzx_ids = {f"YZXCONV-{index:03d}" for index in range(1, 16)}
        anchors = {anchor["anchor_id"]: set(anchor["phase_task_ids"]) for anchor in actual["anchors"]}
        self.assertTrue(yzx_ids.issubset(anchors["NS-DIRECTION"]))
        self.assertTrue(yzx_ids.issubset(anchors["NS-PROGRESS"]))

    def test_yzx_proof_is_hash_bound_into_the_append_only_ledger(self) -> None:
        proof_path = ROOT / "proof_records" / "YZXCONV-001.proof.json"
        expected_hash = hashlib.sha256(proof_path.read_bytes()).hexdigest()
        entries = [
            json.loads(line)
            for line in (ROOT / "proof_records" / "proof_ledger.jsonl")
            .read_text(encoding="utf-8")
            .splitlines()
            if line.strip()
        ]
        matching = [entry for entry in entries if entry["task_id"] == "YZXCONV-001"]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["revision"], "1")
        self.assertEqual(matching[0]["status"], "pass")
        self.assertEqual(matching[0]["proof_sha256"], expected_hash)

    def test_desktop_and_rules_gaps_are_explicit_task_gates(self) -> None:
        rows = {
            row["task_id"]: row
            for row in read_csv(ROOT / "yazelix_runtime_convergence" / "task_graph.source.csv")
        }
        self.assertIn("/home/flexnetos/.codex/RULES.md", rows["YZXCONV-004"]["allowed_paths"])
        self.assertIn("packaging/**", rows["YZXCONV-011"]["allowed_paths"])
        self.assertIn("without sh -lc", rows["YZXCONV-011"]["verification_gate"])
        self.assertIn(
            "/home/flexnetos/.local/share/applications/**",
            rows["YZXCONV-014"]["allowed_paths"],
        )
        self.assertIn(
            "/home/flexnetos/.nix-profile/bin/yzx",
            rows["YZXCONV-014"]["verification_gate"],
        )
        self.assertIn("profile layout override", rows["YZXCONV-014"]["verification_gate"])


if __name__ == "__main__":
    unittest.main()
