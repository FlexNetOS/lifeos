from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).parent / "scripts"
MATERIALIZER_PATH = SCRIPTS_DIR / "materialize_runner_proofs.py"
sys.path.insert(0, str(SCRIPTS_DIR))
SPEC = importlib.util.spec_from_file_location(
    "materialize_runner_proofs",
    MATERIALIZER_PATH,
)
assert SPEC is not None and SPEC.loader is not None
materializer = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = materializer
SPEC.loader.exec_module(materializer)
runner = materializer.runner


class MaterializeRunnerProofsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temporary.name)
        self.packet_dir = (
            self.repo_root
            / "planning-spine-v0"
            / "task_tables"
            / "packets"
        )
        self.packet_dir.mkdir(parents=True)
        self.receipts_dir = (
            self.repo_root
            / "planning-spine-v0"
            / "task_tables"
            / "execution_receipts"
        )
        self.execution_framework = (
            self.repo_root
            / "planning-spine-v0"
            / "package"
            / "execution-framework"
        )
        (self.execution_framework / "proof_records").mkdir(parents=True)
        (self.execution_framework / "migration-artifacts").mkdir(parents=True)
        self.run_id = "20260727T000000000000Z-test"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def create_fixture(
        self,
        *,
        task_id: str = "COMPONENT-001_TEST",
        proof_uri: str = "proof_records/COMPONENT-001_TEST.proof.json",
        legacy_proof: bytes | None = None,
    ) -> tuple[materializer.RunContext, runner.Task, Path, Path]:
        packet_value = {
            "packet_schema_version": "1.0",
            "task_id": task_id,
            "depends_on": [],
            "can_run_parallel": True,
            "parallel_group": "test",
            "max_parallel": 2,
            "priority": 1,
            "command_template": "true",
            "verification_command": "true",
            "proof_required": True,
            "proof_uri": proof_uri,
            "target_artifacts": [
                "migration-artifacts/component-001-test/result.json",
                "migration-artifacts/component-001-test/*.md",
                "semantic capability label",
            ],
            "needs_capability_probe": True,
            "probe_class": "drift-canary",
            "completion_gate": "NOT evidence of implementation",
            "helper_id": "helper-test",
            "model_tag": "gpt-5.3-codex-spark",
            "repo_path": ".",
        }
        packet_path = self.packet_dir / f"{task_id}.json"
        packet_path.write_text(
            json.dumps(packet_value, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        source_task = runner.load_task(packet_path, self.repo_root)
        tasks, run_dir = runner.snapshot_tasks(
            {task_id: source_task},
            self.receipts_dir,
            self.run_id,
        )
        task = tasks[task_id]
        graph_digest = runner.graph_sha256(tasks)
        runner.atomic_write_json(
            run_dir / "run.json",
            {
                "schema": runner.RUN_SCHEMA,
                "run_id": self.run_id,
                "graph_sha256": graph_digest,
                "task_count": 1,
                "status_counts": {
                    "blocked": 0,
                    "completed": 1,
                    "failed": 0,
                    "pending": 0,
                },
            },
        )

        attempt_id = "20260727T000001000000Z-attempt"
        receipt_dir = (
            self.receipts_dir
            / task_id
            / task.packet_sha256
        )
        logs_dir = receipt_dir / "logs" / attempt_id
        logs_dir.mkdir(parents=True)

        def command_result(prefix: str) -> dict[str, object]:
            stdout_path = logs_dir / f"{prefix}.stdout.log"
            stderr_path = logs_dir / f"{prefix}.stderr.log"
            stdout_path.write_bytes(b"ok\n")
            stderr_path.write_bytes(b"")
            return {
                "argv": ["/bin/bash", "-lc", "true"],
                "cwd": str(self.repo_root),
                "exit_code": 0,
                "timed_out": False,
                "started_at": "2026-07-27T00:00:01Z",
                "finished_at": "2026-07-27T00:00:02Z",
                "stdout": {
                    "path": str(stdout_path),
                    "sha256": runner.sha256_file(stdout_path),
                },
                "stderr": {
                    "path": str(stderr_path),
                    "sha256": runner.sha256_file(stderr_path),
                },
            }

        receipt_path = receipt_dir / f"{attempt_id}.json"
        runner.atomic_write_json(
            receipt_path,
            {
                "schema": runner.RECEIPT_SCHEMA,
                "runner_schema": runner.RUNNER_SCHEMA,
                "run_id": self.run_id,
                "attempt_id": attempt_id,
                "task_id": task_id,
                "packet_path": str(task.packet_path),
                "source_packet_path": str(task.source_packet_path),
                "packet_sha256": task.packet_sha256,
                "graph_sha256": graph_digest,
                "execution_input_sha256": task.packet_sha256,
                "authorization": None,
                "executor_refusal": None,
                "started_at": "2026-07-27T00:00:01Z",
                "finished_at": "2026-07-27T00:00:03Z",
                "status": "completed",
                "exit_code": 0,
                "command": command_result("command"),
                "verification": command_result("verification"),
            },
        )

        proof_path = (
            self.execution_framework.parent / proof_uri
            if proof_uri.startswith("execution-framework/")
            else self.execution_framework / proof_uri
        )
        if legacy_proof is not None:
            proof_path.parent.mkdir(parents=True, exist_ok=True)
            proof_path.write_bytes(legacy_proof)
        context = materializer.load_run_context(
            self.repo_root,
            self.receipts_dir,
            self.execution_framework,
            self.run_id,
        )
        result_path = (
            self.execution_framework
            / "migration-artifacts"
            / "component-001-test"
            / "result.json"
        )
        result_path.parent.mkdir(parents=True, exist_ok=True)
        (result_path.parent / "semantic-evidence.md").write_text(
            "verified fixture\n",
            encoding="utf-8",
        )
        return context, task, proof_path, result_path

    def test_materializes_exact_receipt_and_preserves_legacy_proof(self) -> None:
        legacy = (
            b'{"proof_schema_version":"1.0","task_id":"COMPONENT-001_TEST",'
            b'"status":"completed","semantic_evidence":"keep me"}\n'
        )
        context, task, proof_path, result_path = self.create_fixture(
            proof_uri=(
                "execution-framework/proof_records/"
                "COMPONENT-001_TEST.proof.json"
            ),
            legacy_proof=legacy,
        )
        ledger_path = self.execution_framework / "proof_records" / "proof_ledger.jsonl"
        legacy_ledger_line = (
            '{"task_id":"LEGACY","status":"completed","evidence":"preserve"}\n'
        )
        ledger_path.write_text(legacy_ledger_line, encoding="utf-8")

        dry_run = materializer.materialize_run(context, write=False)
        self.assertEqual("passed", dry_run["status"])
        self.assertFalse(result_path.exists())
        self.assertEqual(legacy, proof_path.read_bytes())

        report = materializer.materialize_run(context, write=True)
        self.assertEqual("passed", report["status"])
        self.assertEqual(1, report["validated_receipt_count"])
        self.assertEqual(1, report["receipt_result_artifact_count"])
        self.assertEqual(1, report["descriptive_artifact_declaration_count"])

        result = json.loads(result_path.read_text(encoding="utf-8"))
        self.assertEqual(materializer.RESULT_SCHEMA, result["schema"])
        self.assertEqual(context.run_id, result["orchestration"]["run_id"])
        self.assertEqual("not_claimed", result["implementation_scope"])
        self.assertIn(
            "existing_glob",
            {row["status"] for row in result["artifact_declarations"]},
        )

        proof = json.loads(proof_path.read_text(encoding="utf-8"))
        output = proof["verification_output"]
        self.assertEqual(materializer.MATERIALIZATION_SCHEMA, output["materialization_schema"])
        self.assertEqual(task.packet_sha256, output["packet_sha256"])
        self.assertEqual("not_claimed", output["implementation_scope"])
        history_path = self.repo_root / output["preserved_task_proof"]["path"]
        self.assertEqual(legacy, history_path.read_bytes())

        lines = ledger_path.read_text(encoding="utf-8").splitlines()
        self.assertEqual(json.loads(legacy_ledger_line), json.loads(lines[0]))
        self.assertEqual(2, len(lines))

        proof_bytes = proof_path.read_bytes()
        result_bytes = result_path.read_bytes()
        second = materializer.materialize_run(context, write=True)
        self.assertEqual(0, second["ledger_records_appended"])
        self.assertEqual(proof_bytes, proof_path.read_bytes())
        self.assertEqual(result_bytes, result_path.read_bytes())
        self.assertEqual(2, len(ledger_path.read_text(encoding="utf-8").splitlines()))

    def test_rejects_tampered_receipt_log(self) -> None:
        context, task, _, _ = self.create_fixture()
        receipt_path = max(
            (
                self.receipts_dir
                / task.task_id
                / task.packet_sha256
            ).glob("*.json")
        )
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        Path(receipt["command"]["stdout"]["path"]).write_text(
            "tampered\n",
            encoding="utf-8",
        )
        with self.assertRaisesRegex(
            materializer.MaterializationError,
            "command stdout log digest mismatch",
        ):
            materializer.materialize_run(context, write=False)

    def test_concurrent_cli_writes_append_one_receipt_binding(self) -> None:
        self.create_fixture()
        arguments = [
            sys.executable,
            str(MATERIALIZER_PATH),
            "--run-id",
            self.run_id,
            "--repo-root",
            str(self.repo_root),
            "--receipts-dir",
            str(self.receipts_dir),
            "--execution-framework-root",
            str(self.execution_framework),
            "--write",
        ]
        processes = [
            subprocess.Popen(
                arguments,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            for _ in range(2)
        ]
        results = [process.communicate(timeout=20) for process in processes]
        for process, (stdout, stderr) in zip(processes, results, strict=True):
            self.assertEqual(0, process.returncode, (stdout, stderr))

        ledger_path = self.execution_framework / "proof_records" / "proof_ledger.jsonl"
        records = [
            json.loads(line)
            for line in ledger_path.read_text(encoding="utf-8").splitlines()
        ]
        matching = [
            record
            for record in records
            if materializer._ledger_key(record) is not None
        ]
        self.assertEqual(1, len(matching))


if __name__ == "__main__":
    unittest.main()
