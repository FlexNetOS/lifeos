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
        unresolved: bool = True,
    ) -> tuple[materializer.RunContext, runner.Task, Path, Path]:
        packet_value = {
            "schema": "test.execution-packet.v1",
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
            "needs_capability_probe": unresolved,
            "probe_class": "drift-canary" if unresolved else "capability-probe",
            "completion_gate": (
                "NOT evidence of implementation"
                if unresolved
                else "command and independent verification both exit zero"
            ),
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
        run_receipt = {
            "schema": runner.RUN_SCHEMA,
            "run_id": self.run_id,
            "graph_sha256": graph_digest,
            "task_count": 1,
            "status_counts": {
                "blocked": 0,
                "completed": 1,
                "available": 0,
                "failed": 0,
                "pending": 0,
            },
        }
        run_receipt["run_receipt_sha256"] = runner.prefixed_record_sha256(
            run_receipt,
            "run_receipt_sha256",
        )
        runner.atomic_write_json(run_dir / "run.json", run_receipt)

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

        receipt_path = runner.write_task_receipt(
            self.receipts_dir,
            task,
            {
                "schema": runner.RECEIPT_SCHEMA,
                "runner_schema": runner.RUNNER_SCHEMA,
                "record_type": "execution",
                "run_id": self.run_id,
                "attempt_id": attempt_id,
                "node_id": task.node_id,
                "task_id": task_id,
                "packet_path": str(task.packet_path),
                "source_packet_path": str(task.source_packet_path),
                "packet_sha256": task.packet_sha256,
                "semantic_contract_sha256": task.semantic_contract_sha256,
                "source_authority": task.source_authority,
                "graph_sha256": graph_digest,
                "execution_input_sha256": task.packet_sha256,
                "authorization": None,
                "executor_refusal": None,
                "started_at": "2026-07-27T00:00:01Z",
                "finished_at": "2026-07-27T00:00:03Z",
                "status": "completed",
                "exit_code": 0,
                "packet_execution_proven": True,
                "task_completion_proven": True,
                "command": command_result("command"),
                "verification": command_result("verification"),
            },
            f"{attempt_id}.json",
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
        self.assertEqual("blocked", dry_run["status"])
        self.assertEqual(1, dry_run["unresolved_implementation_obligation_count"])
        self.assertFalse(result_path.exists())
        self.assertEqual(legacy, proof_path.read_bytes())

        report = materializer.materialize_run(context, write=True)
        self.assertEqual("blocked", report["status"])
        self.assertEqual(1, report["validated_receipt_count"])
        self.assertEqual(1, report["receipt_result_artifact_count"])
        self.assertEqual(1, report["descriptive_artifact_declaration_count"])

        result = json.loads(result_path.read_text(encoding="utf-8"))
        self.assertEqual(materializer.RESULT_SCHEMA, result["schema"])
        self.assertEqual("blocked", result["status"])
        self.assertFalse(result["task_completion_proven"])
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
        self.assertEqual("blocked", proof["status"])
        self.assertFalse(output["task_completion_proven"])
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

    def test_capability_probe_with_independent_verification_can_complete(self) -> None:
        context, _, proof_path, result_path = self.create_fixture(unresolved=False)

        report = materializer.materialize_run(context, write=True)

        self.assertEqual("passed", report["status"])
        self.assertEqual(0, report["unresolved_implementation_obligation_count"])
        result = json.loads(result_path.read_text(encoding="utf-8"))
        self.assertEqual("passed", result["status"])
        self.assertTrue(result["task_completion_proven"])
        proof = json.loads(proof_path.read_text(encoding="utf-8"))
        self.assertEqual("completed", proof["status"])
        self.assertTrue(proof["verification_output"]["task_completion_proven"])

    def test_classifies_artifacts_relative_to_declared_repo_path(self) -> None:
        context, task, _, result_path = self.create_fixture()
        declarations = [
            (
                self.repo_root,
                result_path.relative_to(self.repo_root).as_posix(),
            ),
            (
                self.repo_root.parent,
                result_path.relative_to(self.repo_root.parent).as_posix(),
            ),
        ]

        for repo_path, declaration in declarations:
            with self.subTest(repo_path=repo_path):
                task.packet["repo_path"] = str(repo_path)
                task.packet["target_artifacts"] = [declaration]
                artifacts = materializer.classify_artifacts(context, task)
                self.assertEqual(1, len(artifacts))
                self.assertEqual("receipt_result", artifacts[0].kind)
                self.assertEqual(result_path.resolve(), artifacts[0].path)

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
            "failed integrity",
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
            self.assertEqual(1, process.returncode, (stdout, stderr))

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

    def test_hash_chained_proof_ledger_rejects_tampering(self) -> None:
        context, _, _, _ = self.create_fixture(unresolved=False)
        materializer.materialize_run(context, write=True)
        ledger_path = (
            self.execution_framework / "proof_records" / "proof_ledger.jsonl"
        )
        records = [
            json.loads(line)
            for line in ledger_path.read_text(encoding="utf-8").splitlines()
        ]
        self.assertEqual(1, records[-1]["proof_seq"])
        self.assertTrue(records[-1]["proof_hash"].startswith("sha256:"))
        records[-1]["status"] = "blocked"
        ledger_path.write_text(
            "\n".join(json.dumps(record) for record in records) + "\n",
            encoding="utf-8",
        )

        with self.assertRaisesRegex(
            materializer.MaterializationError,
            "invalid proof ledger hash chain",
        ):
            materializer.materialize_run(context, write=False)

    def test_nested_required_proof_fails_closed(self) -> None:
        packet_path = self.packet_dir / "NESTED.json"
        packet_path.write_text(
            json.dumps(
                {
                    "schema": "test.execution-packet.v1",
                    "task_id": "NESTED",
                    "proof": {"required": True, "uri": None},
                }
            ),
            encoding="utf-8",
        )
        task = runner.load_task(packet_path, self.repo_root)

        self.assertTrue(materializer._proof_required(task))


if __name__ == "__main__":
    unittest.main()
