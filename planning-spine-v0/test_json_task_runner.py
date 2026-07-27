from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path


RUNNER_PATH = Path(__file__).parent / "scripts" / "json_task_runner.py"
SPEC = importlib.util.spec_from_file_location("json_task_runner", RUNNER_PATH)
assert SPEC is not None and SPEC.loader is not None
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)


def packet(
    task_id: str,
    *,
    depends_on: list[str] | None = None,
    parallel: bool = False,
    group: str = "default",
    limit: int = 4,
    command: str | None = None,
) -> dict[str, object]:
    return {
        "schema": "test.execution-packet.v1",
        "task_id": task_id,
        "depends_on": depends_on or [],
        "can_run_parallel": parallel,
        "parallel_group": group,
        "max_parallel": limit,
        "command_template": command,
    }


class JsonTaskRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.packet_root = self.root / "planning-spine-v0"
        self.packet_dir = self.packet_root / "task_tables" / "packets"
        self.packet_dir.mkdir(parents=True)
        self.receipts = self.root / "receipts"
        self.calls = self.root / "calls.jsonl"
        self.helper = self.root / "executor.py"
        self.helper.write_text(
            textwrap.dedent(
                """
                import json
                import os
                import pathlib
                import sys
                import time

                task = json.load(sys.stdin)
                record = {
                    "event": "start",
                    "task_id": task["task_id"],
                    "packet_sha256": os.environ["LIFEOS_PACKET_SHA256"],
                    "cargo_target_dir": os.environ["CARGO_TARGET_DIR"],
                    "time": time.monotonic(),
                }
                calls = pathlib.Path(os.environ["TEST_CALLS"])
                with calls.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(record) + "\\n")
                time.sleep(float(task.get("sleep", 0)))
                if task.get("fail"):
                    raise SystemExit(int(task["fail"]))
                """
            ).strip()
            + "\n",
            encoding="utf-8",
        )
        self.environment_before = os.environ.get("TEST_CALLS")
        os.environ["TEST_CALLS"] = str(self.calls)

    def tearDown(self) -> None:
        if self.environment_before is None:
            os.environ.pop("TEST_CALLS", None)
        else:
            os.environ["TEST_CALLS"] = self.environment_before
        self.temporary.cleanup()

    def write_packet(self, value: dict[str, object]) -> Path:
        path = self.packet_dir / f"{value['task_id']}.json"
        path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        return path

    def load(self) -> dict[str, runner.Task]:
        return runner.load_tasks(self.packet_root, self.root)

    def execute(
        self,
        tasks: dict[str, runner.Task],
        *,
        retry_failed: bool = False,
        max_parallel: int = 2,
    ) -> tuple[int, dict[str, str], Path]:
        return runner.run_tasks(
            tasks,
            (sys.executable, str(self.helper)),
            self.receipts,
            max_parallel,
            10,
            retry_failed,
            False,
        )

    def call_records(self) -> list[dict[str, object]]:
        if not self.calls.exists():
            return []
        return [
            json.loads(line)
            for line in self.calls.read_text(encoding="utf-8").splitlines()
        ]

    def test_rejects_duplicate_ids_missing_dependencies_and_cycles(self) -> None:
        self.write_packet(packet("A"))
        duplicate_dir = self.packet_root / "x" / "execution_packets"
        duplicate_dir.mkdir(parents=True)
        (duplicate_dir / "duplicate.json").write_text(
            json.dumps(packet("A")), encoding="utf-8"
        )
        with self.assertRaisesRegex(runner.RunnerError, "duplicate task_id A"):
            self.load()

        (duplicate_dir / "duplicate.json").unlink()
        self.write_packet(packet("B", depends_on=["MISSING"]))
        with self.assertRaisesRegex(runner.RunnerError, "B->MISSING"):
            self.load()

        (self.packet_dir / "B.json").unlink()
        self.write_packet(packet("A", depends_on=["B"]))
        self.write_packet(packet("B", depends_on=["A"]))
        with self.assertRaisesRegex(runner.RunnerError, "dependency cycle"):
            self.load()

    def test_dependency_order_digest_receipts_and_resume(self) -> None:
        path_a = self.write_packet(packet("A"))
        self.write_packet(packet("B", depends_on=["A"]))
        tasks = self.load()
        exit_code, statuses, run_path = self.execute(tasks)
        self.assertEqual(0, exit_code)
        self.assertEqual({"A": "completed", "B": "completed"}, statuses)
        self.assertTrue(run_path.exists())
        self.assertEqual(["A", "B"], [row["task_id"] for row in self.call_records()])
        cargo_targets = {
            row["cargo_target_dir"] for row in self.call_records()
        }
        self.assertEqual(1, len(cargo_targets))
        cargo_target = Path(cargo_targets.pop())
        self.assertEqual("lifeos-json-task-cargo", cargo_target.parent.parent.name)
        self.assertTrue(cargo_target.name.startswith(f"{self.root.name}-"))

        exit_code, statuses, _ = self.execute(self.load())
        self.assertEqual(0, exit_code)
        self.assertEqual(2, len(self.call_records()))
        self.assertEqual({"A": "completed", "B": "completed"}, statuses)

        changed = packet("A")
        changed["changed"] = True
        path_a.write_text(json.dumps(changed, indent=2) + "\n", encoding="utf-8")
        exit_code, statuses, _ = self.execute(self.load())
        self.assertEqual(0, exit_code)
        self.assertEqual("completed", statuses["A"])
        self.assertEqual(4, len(self.call_records()))
        self.assertEqual(
            ["A", "B"],
            [row["task_id"] for row in self.call_records()[-2:]],
        )
        receipt_paths = list((self.receipts / "A").glob("*/*.json"))
        self.assertEqual(2, len(receipt_paths))
        for receipt_path in receipt_paths:
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            self.assertEqual(runner.RECEIPT_SCHEMA, receipt["schema"])
            self.assertEqual(receipt_path.parent.name, receipt["packet_sha256"])

    def test_latest_receipt_wins_and_legacy_unapproved_completion_fails(self) -> None:
        value = packet("APPROVAL_REQUIRED")
        value["approval"] = {
            "required": True,
            "approval_id": "APPROVAL-APPROVAL_REQUIRED",
        }
        task_path = self.write_packet(value)
        task = runner.load_task(task_path, self.root)
        receipt_dir = self.receipts / task.task_id / task.packet_sha256
        receipt_dir.mkdir(parents=True)
        base = {
            "schema": runner.RECEIPT_SCHEMA,
            "task_id": task.task_id,
            "packet_sha256": task.packet_sha256,
        }
        (receipt_dir / "old.json").write_text(
            json.dumps(
                {
                    **base,
                    "finished_at": "2026-01-01T00:00:00Z",
                    "status": "completed",
                }
            ),
            encoding="utf-8",
        )
        self.assertEqual("failed", runner.prior_status(self.receipts, task))
        (receipt_dir / "new.json").write_text(
            json.dumps(
                {
                    **base,
                    "finished_at": "2026-01-02T00:00:00Z",
                    "status": "failed",
                }
            ),
            encoding="utf-8",
        )
        self.assertEqual("failed", runner.prior_status(self.receipts, task))

    def test_failure_blocks_dependents_and_requires_explicit_retry(self) -> None:
        failing = packet("A")
        failing["fail"] = 7
        path = self.write_packet(failing)
        self.write_packet(packet("B", depends_on=["A"]))
        self.write_packet(packet("C", depends_on=["B"]))
        exit_code, statuses, _ = self.execute(self.load())
        self.assertEqual(1, exit_code)
        self.assertEqual(
            {"A": "failed", "B": "blocked", "C": "blocked"},
            statuses,
        )
        self.assertEqual(["A"], [row["task_id"] for row in self.call_records()])

        exit_code, statuses, _ = self.execute(self.load())
        self.assertEqual(1, exit_code)
        self.assertEqual(1, len(self.call_records()))

        passing = packet("A")
        path.write_text(json.dumps(passing, indent=2) + "\n", encoding="utf-8")
        exit_code, statuses, _ = self.execute(self.load(), retry_failed=True)
        self.assertEqual(0, exit_code)
        self.assertEqual(
            {"A": "completed", "B": "completed", "C": "completed"},
            statuses,
        )

    def test_prior_completions_are_invalidated_when_a_dependency_failed(self) -> None:
        self.write_packet(packet("A"))
        self.write_packet(packet("B", depends_on=["A"]))
        self.write_packet(packet("C", depends_on=["B"]))
        tasks = self.load()

        for task_id, status in (
            ("A", "failed"),
            ("B", "completed"),
            ("C", "completed"),
        ):
            task = tasks[task_id]
            receipt_dir = self.receipts / task.task_id / task.packet_sha256
            receipt_dir.mkdir(parents=True)
            (receipt_dir / f"{task_id}.json").write_text(
                json.dumps(
                    {
                        "schema": runner.RECEIPT_SCHEMA,
                        "task_id": task.task_id,
                        "packet_sha256": task.packet_sha256,
                        "finished_at": "2026-01-01T00:00:01Z",
                        "status": status,
                    }
                ),
                encoding="utf-8",
            )

        observed = {
            task_id: runner.prior_status(self.receipts, task)
            for task_id, task in tasks.items()
        }
        self.assertEqual(
            {"A": "failed", "B": "pending", "C": "pending"},
            runner.dependency_consistent_statuses(tasks, observed),
        )

    def test_bounded_parallel_dispatch(self) -> None:
        for task_id in ("A", "B", "C"):
            value = packet(task_id, parallel=True, group="workers", limit=2)
            value["sleep"] = 0.2
            self.write_packet(value)
        tasks = self.load()
        waves = runner.schedule_waves(tasks, 2)
        self.assertEqual(2, len(waves))
        self.assertEqual(2, len(waves[0]))
        started = time.monotonic()
        exit_code, statuses, _ = self.execute(tasks, max_parallel=2)
        duration = time.monotonic() - started
        self.assertEqual(0, exit_code)
        self.assertEqual({"completed"}, set(statuses.values()))
        self.assertLess(duration, 0.58)

    def test_declared_command_runs_without_agent_prompt(self) -> None:
        marker = self.root / "marker.txt"
        quoted = str(marker).replace("'", "'\\''")
        self.write_packet(
            packet(
                "DIRECT",
                command=f"python3 -c 'from pathlib import Path; Path(\"{quoted}\").write_text(\"ok\")'",
            )
        )
        exit_code, statuses, _ = self.execute(self.load())
        self.assertEqual(0, exit_code)
        self.assertEqual("ok", marker.read_text(encoding="utf-8"))
        self.assertEqual([], self.call_records())
        self.assertEqual("completed", statuses["DIRECT"])

    def test_prose_command_template_is_consumed_as_json_not_shell(self) -> None:
        self.write_packet(packet("PROSE", command="Apply the scoped implementation now"))
        exit_code, statuses, _ = self.execute(self.load())
        self.assertEqual(0, exit_code)
        self.assertEqual("completed", statuses["PROSE"])
        self.assertEqual(["PROSE"], [row["task_id"] for row in self.call_records()])

    def test_agent_verification_runs_in_real_task_root(self) -> None:
        fake_codex = self.root / "codex"
        fake_codex.write_text(
            "#!/bin/sh\ncat >/dev/null\n",
            encoding="utf-8",
        )
        fake_codex.chmod(0o700)
        value = packet("VERIFY_ROOT")
        value["verification_command"] = f'test "$PWD" = "{self.root}"'
        self.write_packet(value)

        exit_code, statuses, _ = runner.run_tasks(
            self.load(),
            (str(fake_codex), "-"),
            self.receipts,
            1,
            10,
            False,
            False,
        )

        self.assertEqual(0, exit_code)
        self.assertEqual("completed", statuses["VERIFY_ROOT"])
        receipt_path = next(
            (self.receipts / "VERIFY_ROOT").glob("*/*.json")
        )
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        self.assertEqual(str(self.root), receipt["verification"]["cwd"])

    def test_executor_launch_failure_still_writes_failed_receipt(self) -> None:
        self.write_packet(packet("MISSING_EXECUTOR"))
        tasks = self.load()
        exit_code, statuses, run_path = runner.run_tasks(
            tasks,
            (str(self.root / "does-not-exist"),),
            self.receipts,
            1,
            10,
            False,
            False,
        )
        self.assertEqual(1, exit_code)
        self.assertEqual("failed", statuses["MISSING_EXECUTOR"])
        self.assertTrue(run_path.exists())
        receipts = list((self.receipts / "MISSING_EXECUTOR").glob("*/*.json"))
        self.assertEqual(1, len(receipts))
        receipt = json.loads(receipts[0].read_text(encoding="utf-8"))
        self.assertEqual(127, receipt["exit_code"])
        self.assertEqual("failed", receipt["status"])

    def test_default_executor_is_noninteractive_and_ignores_agent_rules(self) -> None:
        words = runner.DEFAULT_EXECUTOR.split()
        self.assertIn("danger-full-access", words)
        self.assertIn("--ignore-user-config", words)
        self.assertIn("--ignore-rules", words)
        self.assertIn("approval_policy=never", words)
        self.assertIn("project_doc_max_bytes=0", words)
        self.assertIn("project_root_markers=[]", words)
        self.assertIn("plugins", words)
        self.assertIn("hooks", words)
        self.assertEqual("-", words[-1])

    def test_model_routing_honors_packet_and_task_characteristics(self) -> None:
        declared = packet("DECLARED")
        declared["model_tag"] = "gpt-5.3-spark"
        self.write_packet(declared)

        compile_task = packet("COMPILE")
        compile_task["target_files"] = ["Cargo.toml"]
        compile_task["execution"] = {"verification_command": "cargo metadata succeeds"}
        self.write_packet(compile_task)

        critical = packet("CRITICAL")
        critical["risk_level"] = "critical"
        self.write_packet(critical)

        low = packet("LOW")
        low["risk_level"] = "low"
        self.write_packet(low)

        docs = packet("DOCS")
        docs["target_files"] = ["docs/COMMANDS.md", "manifests/PACK.json"]
        self.write_packet(docs)

        self.write_packet(packet("BALANCED"))
        tasks = self.load()
        self.assertEqual(
            ("gpt-5.3-codex-spark", "high"),
            runner.task_model(tasks["DECLARED"]),
        )
        self.assertEqual(
            ("gpt-5.3-codex-spark", "high"),
            runner.task_model(tasks["COMPILE"]),
        )
        self.assertEqual(
            ("gpt-5.6-sol", "high"),
            runner.task_model(tasks["CRITICAL"]),
        )
        self.assertEqual(
            ("gpt-5.6-luna", "medium"),
            runner.task_model(tasks["LOW"]),
        )
        self.assertEqual(
            ("gpt-5.6-luna", "medium"),
            runner.task_model(tasks["DOCS"]),
        )
        self.assertEqual(
            ("gpt-5.6-terra", "medium"),
            runner.task_model(tasks["BALANCED"]),
        )

    def test_run_snapshot_pins_packets_for_safe_resume(self) -> None:
        source = self.write_packet(packet("PINNED"))
        original = self.load()
        original_digest = original["PINNED"].packet_sha256
        run_id = "test-resume"
        snapshotted, run_dir = runner.snapshot_tasks(original, self.receipts, run_id)
        self.assertEqual(original_digest, snapshotted["PINNED"].packet_sha256)

        changed = packet("PINNED")
        changed["changed_after_snapshot"] = True
        source.write_text(json.dumps(changed, indent=2) + "\n", encoding="utf-8")
        self.assertNotEqual(original_digest, self.load()["PINNED"].packet_sha256)

        resumed, observed_run_id = runner.load_snapshot(run_dir, self.root)
        self.assertEqual(run_id, observed_run_id)
        self.assertEqual(original_digest, resumed["PINNED"].packet_sha256)
        self.assertEqual(source, resumed["PINNED"].source_packet_path)
        exit_code, statuses, run_path = runner.run_tasks(
            resumed,
            (sys.executable, str(self.helper)),
            self.receipts,
            1,
            10,
            False,
            False,
            run_id=run_id,
            create_snapshot=False,
        )
        self.assertEqual(0, exit_code)
        self.assertEqual("completed", statuses["PINNED"])
        self.assertEqual(run_dir / "run.json", run_path)
        self.assertIsNone(runner.resumable_run_dir(self.receipts))

    def test_canonical_packet_uses_its_repo_path_as_agent_root(self) -> None:
        target = self.root / "src" / "nu_plugin"
        target.mkdir(parents=True)
        value = packet("ROOTED")
        value["schema"] = "lifeos.execution-packet.v1"
        value["repo_path"] = "src/nu_plugin"
        self.write_packet(value)
        task = self.load()["ROOTED"]
        self.assertEqual(target, task.command_cwd)

    def test_canonical_packet_resolves_meta_workspace_repo_path(self) -> None:
        workspace = self.root / "meta"
        (workspace / ".meta").mkdir(parents=True)
        repo_root = workspace / "src" / "lifeos"
        target = workspace / "src" / "nu_plugin"
        repo_root.mkdir(parents=True)
        target.mkdir()
        packet_path = repo_root / "packet.json"
        value = packet("META_ROOTED")
        value["schema"] = "lifeos.execution-packet.v1"
        value["repo_path"] = "src/nu_plugin"
        packet_path.write_text(json.dumps(value), encoding="utf-8")

        task = runner.load_task(packet_path, repo_root)

        self.assertEqual(target, task.command_cwd)

    def test_meta_workspace_repo_path_wins_over_same_named_repo_subdirectory(self) -> None:
        workspace = self.root / "meta"
        (workspace / ".meta").mkdir(parents=True)
        repo_root = workspace / "src" / "lifeos"
        target = workspace / "src" / "nu_plugin"
        projection = repo_root / "src" / "nu_plugin"
        target.mkdir(parents=True)
        projection.mkdir(parents=True)
        packet_path = repo_root / "packet.json"
        value = packet("META_ROOTED_WITH_PROJECTION")
        value["schema"] = "lifeos.execution-packet.v1"
        value["repo_path"] = "src/nu_plugin"
        packet_path.write_text(json.dumps(value), encoding="utf-8")

        task = runner.load_task(packet_path, repo_root)

        self.assertEqual(target, task.command_cwd)

    def test_reference_packet_resolves_known_repo_placeholder(self) -> None:
        workspace = self.root / "meta"
        (workspace / ".meta").mkdir(parents=True)
        repo_root = workspace / "src" / "lifeos"
        target = workspace / "src" / "envctl"
        repo_root.mkdir(parents=True)
        target.mkdir()
        packet_path = repo_root / "packet.json"
        value = packet("ENVCTL_ROOTED")
        value["repo_path"] = "${ENVCTL_REPO}"
        packet_path.write_text(json.dumps(value), encoding="utf-8")

        task = runner.load_task(packet_path, repo_root)

        self.assertEqual(target, task.command_cwd)

    def test_legacy_reference_packet_dot_repo_path_uses_repo_root(self) -> None:
        packet_dir = (
            self.root
            / "planning-spine-v0"
            / "reference-package"
            / "execution-framework"
            / "execution_packets"
        )
        packet_dir.mkdir(parents=True)
        packet_path = packet_dir / "LEGACY_DOT_ROOTED.json"
        value = packet("LEGACY_DOT_ROOTED")
        value["repo_path"] = "."
        packet_path.write_text(json.dumps(value), encoding="utf-8")

        task = runner.load_task(packet_path, self.root)

        self.assertEqual(self.root, task.command_cwd)

    def test_resume_re_resolves_legacy_dot_repo_path(self) -> None:
        packet_dir = (
            self.root
            / "planning-spine-v0"
            / "reference-package"
            / "execution-framework"
            / "execution_packets"
        )
        packet_dir.mkdir(parents=True)
        packet_path = packet_dir / "LEGACY_DOT_RESUMED.json"
        value = packet("LEGACY_DOT_RESUMED")
        value["repo_path"] = "."
        packet_path.write_text(json.dumps(value), encoding="utf-8")
        task = runner.load_task(packet_path, self.root)
        tasks, run_dir = runner.snapshot_tasks(
            {task.task_id: task},
            self.receipts,
            "legacy-dot-resume",
        )
        self.assertEqual(self.root, tasks["LEGACY_DOT_RESUMED"].command_cwd)
        manifest_path = run_dir / "graph.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["tasks"][0]["command_cwd"] = str(packet_dir.parent)
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        resumed, _ = runner.load_snapshot(run_dir, self.root)

        self.assertEqual(self.root, resumed["LEGACY_DOT_RESUMED"].command_cwd)

    def test_resume_re_resolves_known_repo_placeholder(self) -> None:
        workspace = self.root / "meta"
        (workspace / ".meta").mkdir(parents=True)
        repo_root = workspace / "src" / "lifeos"
        target = workspace / "src" / "envctl"
        repo_root.mkdir(parents=True)
        target.mkdir()
        packet_path = repo_root / "packet.json"
        value = packet("ENVCTL_RESUMED")
        value["repo_path"] = "${ENVCTL_REPO}"
        packet_path.write_text(json.dumps(value), encoding="utf-8")
        task = runner.load_task(packet_path, repo_root)
        tasks, run_dir = runner.snapshot_tasks(
            {task.task_id: task},
            self.receipts,
            "placeholder-resume",
        )
        self.assertEqual(target, tasks["ENVCTL_RESUMED"].command_cwd)
        manifest_path = run_dir / "graph.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["tasks"][0]["command_cwd"] = str(repo_root)
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        resumed, _ = runner.load_snapshot(run_dir, repo_root)

        self.assertEqual(target, resumed["ENVCTL_RESUMED"].command_cwd)

    def test_descriptive_verification_gates_are_not_shell_commands(self) -> None:
        scripts = self.root / "scripts"
        scripts.mkdir()
        verification = scripts / "validate.py"
        verification.write_text("#!/usr/bin/env python3\n", encoding="utf-8")

        self.assertFalse(runner.looks_executable("cargo metadata succeeds", self.root))
        self.assertFalse(
            runner.looks_executable("cargo metadata fixture passes", self.root)
        )
        self.assertFalse(
            runner.looks_executable(
                "CLI/Nu/MCP commands documented",
                self.root,
            )
        )
        self.assertFalse(
            runner.looks_executable(
                "command matrix documented with bounded behavior",
                self.root,
            )
        )
        self.assertFalse(
            runner.looks_executable(
                "envctl export validates",
                self.root,
            )
        )
        self.assertFalse(
            runner.looks_executable(
                "meta selected repo scan works",
                self.root,
            )
        )
        self.assertFalse(
            runner.looks_executable(
                "sync conflict and re-scan tests",
                self.root,
            )
        )
        self.assertTrue(
            runner.looks_executable(
                "scripts/validate.py",
                self.root,
            )
        )

    def test_executor_refusal_is_detected(self) -> None:
        stdout = self.root / "stdout.log"
        stderr = self.root / "stderr.log"
        stdout.write_text(
            "Execution is blocked: approval APPROVAL-X is pending.\n"
            "No files were modified.\n",
            encoding="utf-8",
        )
        stderr.write_text("", encoding="utf-8")
        result = runner.CommandResult(
            argv=("executor",),
            cwd=str(self.root),
            exit_code=0,
            timed_out=False,
            started_at="2026-01-01T00:00:00Z",
            finished_at="2026-01-01T00:00:01Z",
            duration_seconds=1.0,
            stdout_path=str(stdout),
            stdout_sha256=runner.sha256_file(stdout),
            stderr_path=str(stderr),
            stderr_sha256=runner.sha256_file(stderr),
        )

        self.assertIsNotNone(runner.executor_refusal(result))

    def test_blocked_completion_gate_is_detected_and_invalidates_receipt(self) -> None:
        stdout = self.root / "blocked-stdout.log"
        stdout.write_text(
            "CDB022 is blocked; its fixture cannot compile.\n"
            "The completion gate remains unproven until the blocker is fixed.\n",
            encoding="utf-8",
        )
        stderr = self.root / "blocked-stderr.log"
        stderr.write_text("", encoding="utf-8")
        result = runner.CommandResult(
            argv=("executor",),
            cwd=str(self.root),
            exit_code=0,
            timed_out=False,
            started_at="2026-01-01T00:00:00Z",
            finished_at="2026-01-01T00:00:01Z",
            duration_seconds=1.0,
            stdout_path=str(stdout),
            stdout_sha256=runner.sha256_file(stdout),
            stderr_path=str(stderr),
            stderr_sha256=runner.sha256_file(stderr),
        )
        self.assertIsNotNone(runner.executor_refusal(result))

        task_path = self.write_packet(packet("CDB022"))
        task = runner.load_task(task_path, self.root)
        receipt_dir = self.receipts / task.task_id / task.packet_sha256
        receipt_dir.mkdir(parents=True)
        (receipt_dir / "blocked.json").write_text(
            json.dumps(
                {
                    "schema": runner.RECEIPT_SCHEMA,
                    "task_id": task.task_id,
                    "packet_sha256": task.packet_sha256,
                    "finished_at": "2026-01-01T00:00:01Z",
                    "status": "completed",
                    "command": {
                        "stdout": {
                            "path": str(stdout),
                            "sha256": runner.sha256_file(stdout),
                        }
                    },
                }
            ),
            encoding="utf-8",
        )
        self.assertEqual("failed", runner.prior_status(self.receipts, task))

    def test_failed_verification_narrative_is_detected(self) -> None:
        narratives = (
            "Result: **failed** (dependency=failed).\n"
            "The dependency gate is blocking.\n"
            "final_verification_report.status = pass_with_external_blocker\n",
            "Execution status for VER-303: **failed**.\n"
            "The dependency gate is failing.\n",
            "Result is therefore task-level `failed`/blocked until VER-301 is resolved.\n",
            "Overall VER-301 remains failed because its dependency is failed.\n",
            "Validation completed with a fail-closed result.\n"
            "Evidence: failed proof.\n",
        )
        for index, narrative in enumerate(narratives):
            with self.subTest(index=index):
                stdout = self.root / f"failed-verification-{index}.log"
                stdout.write_text(narrative, encoding="utf-8")
                result = runner.CommandResult(
                    argv=("executor",),
                    cwd=str(self.root),
                    exit_code=0,
                    timed_out=False,
                    started_at="2026-01-01T00:00:00Z",
                    finished_at="2026-01-01T00:00:01Z",
                    duration_seconds=1.0,
                    stdout_path=str(stdout),
                    stdout_sha256=runner.sha256_file(stdout),
                    stderr_path=str(self.root / "unused-stderr.log"),
                    stderr_sha256="",
                )

                self.assertIsNotNone(runner.executor_refusal(result))

    def test_standalone_external_blocker_pass_is_not_an_executor_refusal(self) -> None:
        stdout = self.root / "stdout.log"
        stderr = self.root / "stderr.log"
        stdout.write_text(
            "final verification status=pass_with_external_blocker "
            "tasks=80 packets=80 proofs=86\n",
            encoding="utf-8",
        )
        stderr.write_text("", encoding="utf-8")
        result = runner.CommandResult(
            argv=("python3", "scripts/verify_history_and_completeness.py"),
            cwd=str(self.root),
            exit_code=0,
            timed_out=False,
            started_at=runner.utc_now(),
            finished_at=runner.utc_now(),
            duration_seconds=0.1,
            stdout_path=str(stdout),
            stdout_sha256=runner.sha256_file(stdout),
            stderr_path=str(stderr),
            stderr_sha256=runner.sha256_file(stderr),
        )

        self.assertIsNone(runner.executor_refusal(result))

    def test_executor_trace_does_not_override_completed_final_answer(self) -> None:
        stdout = self.root / "stdout.log"
        stderr = self.root / "stderr.log"
        stdout.write_text(
            "Completed TASK-CDB002. All deterministic checks passed.\n",
            encoding="utf-8",
        )
        stderr.write_text(
            "Stale recalled context: approval APPROVAL-X is pending.\n",
            encoding="utf-8",
        )
        result = runner.CommandResult(
            argv=("executor",),
            cwd=str(self.root),
            exit_code=0,
            timed_out=False,
            started_at="2026-01-01T00:00:00Z",
            finished_at="2026-01-01T00:00:01Z",
            duration_seconds=1.0,
            stdout_path=str(stdout),
            stdout_sha256=runner.sha256_file(stdout),
            stderr_path=str(stderr),
            stderr_sha256=runner.sha256_file(stderr),
        )

        self.assertIsNone(runner.executor_refusal(result))

    def test_required_execution_block_is_not_an_executor_refusal(self) -> None:
        stdout = self.root / "stdout.log"
        stderr = self.root / "stderr.log"
        stdout.write_text(
            "Completed TASK-CDB045.\n"
            "- Unsafe-capture gate test passes.\n"
            "- Default policy refuses without the unsafe flag.\n"
            "- MCP dynamic execution is blocked.\n",
            encoding="utf-8",
        )
        stderr.write_text("", encoding="utf-8")
        result = runner.CommandResult(
            argv=("executor",),
            cwd=str(self.root),
            exit_code=0,
            timed_out=False,
            started_at="2026-01-01T00:00:00Z",
            finished_at="2026-01-01T00:00:01Z",
            duration_seconds=1.0,
            stdout_path=str(stdout),
            stdout_sha256=runner.sha256_file(stdout),
            stderr_path=str(stderr),
            stderr_sha256=runner.sha256_file(stderr),
        )

        self.assertIsNone(runner.executor_refusal(result))

    def test_cargo_target_never_lands_in_the_session_runtime_dir(self) -> None:
        # Regression anchor. cargo_target_dir() used to derive its root from
        # XDG_RUNTIME_DIR. That path is a RAM tmpfs whose budget is shared with the
        # wayland socket, dconf, dbus and gnome-keyring, so build artifacts there can
        # starve the graphical session: on 2026-07-27 a single run left 20G in
        # /run/user/1001/lifeos-json-task-cargo while the tmpfs sat at 84% and the
        # GNOME session had to be restarted. Build artifacts are durable, not runtime.
        self.write_packet(packet("CARGO"))
        task = self.load()["CARGO"]
        runtime = self.root / "runtime"
        previous_runtime = os.environ.get("XDG_RUNTIME_DIR")
        previous_root = os.environ.get("LIFEOS_TASK_CARGO_ROOT")
        os.environ["XDG_RUNTIME_DIR"] = str(runtime)
        os.environ.pop("LIFEOS_TASK_CARGO_ROOT", None)
        try:
            default_target = runner.cargo_target_dir(task, "run")
        finally:
            if previous_runtime is None:
                os.environ.pop("XDG_RUNTIME_DIR", None)
            else:
                os.environ["XDG_RUNTIME_DIR"] = previous_runtime

        self.assertNotIn(
            runtime,
            default_target.parents,
            "cargo target must never be rooted in XDG_RUNTIME_DIR",
        )
        self.assertIn(
            Path("meta/var/cargo-target"),
            [Path(*p.parts[-3:]) for p in default_target.parents if len(p.parts) >= 3],
            "cargo target must default to the durable meta cargo root",
        )

        # The override exists so tests and sandboxes can redirect the durable root.
        isolated = self.root / "isolated-cargo"
        os.environ["LIFEOS_TASK_CARGO_ROOT"] = str(isolated)
        try:
            overridden = runner.cargo_target_dir(task, "run")
        finally:
            if previous_root is None:
                os.environ.pop("LIFEOS_TASK_CARGO_ROOT", None)
            else:
                os.environ["LIFEOS_TASK_CARGO_ROOT"] = previous_root
        self.assertIn(isolated, overridden.parents)
        # Layout contract is unchanged by the reroot.
        self.assertEqual("lifeos-json-task-cargo", overridden.parent.parent.name)

    def test_codex_cell_excludes_parent_agent_instructions(self) -> None:
        (self.root / "AGENTS.md").write_text("must not be injected\n", encoding="utf-8")
        visible = self.root / "visible.txt"
        visible.write_text("visible\n", encoding="utf-8")
        self.write_packet(packet("ISOLATED"))
        task = self.load()["ISOLATED"]
        previous_runtime = os.environ.get("XDG_RUNTIME_DIR")
        os.environ["XDG_RUNTIME_DIR"] = str(self.root / "runtime")
        try:
            cell = runner.prepare_codex_cell(task, "run", "attempt")
        finally:
            if previous_runtime is None:
                os.environ.pop("XDG_RUNTIME_DIR", None)
            else:
                os.environ["XDG_RUNTIME_DIR"] = previous_runtime
        self.assertFalse((cell / "AGENTS.md").exists())
        self.assertEqual(visible, (cell / "visible.txt").resolve())
        self.assertEqual(self.root, (cell / "__task_root__").resolve())
        argv = runner.codex_argv(("codex", "exec", "-"), cell, task)
        self.assertTrue(Path(argv[0]).is_absolute())
        self.assertEqual("-", argv[-1])
        self.assertIn("--cd", argv)
        self.assertNotIn("--add-dir", argv)
        self.assertEqual("gpt-5.6-terra", argv[argv.index("--model") + 1])
        self.assertIn("model_reasoning_effort=medium", argv)
        nested = subprocess.run(
            [cell / ".lifeos-bin" / "codex", "exec"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(126, nested.returncode)
        self.assertIn("nested codex exec is disabled", nested.stderr)

if __name__ == "__main__":
    unittest.main()
