#!/usr/bin/env python3
"""Verify that every strict JSON task capability was adopted in one frozen run."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any


RUNNER_PATH = Path(__file__).with_name("json_task_runner.py")
SPEC = importlib.util.spec_from_file_location("lifeos_json_task_runner", RUNNER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load runner from {RUNNER_PATH}")
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser()
    value.add_argument(
        "--receipts-dir",
        type=Path,
        default=Path(
            os.environ.get(
                "LIFEOS_RECEIPTS_DIR",
                "planning-spine-v0/task_tables/execution_receipts",
            )
        ),
    )
    value.add_argument("--run-id", default=os.environ.get("LIFEOS_TASK_RUN_ID"))
    value.add_argument(
        "--release-node-id",
        default=os.environ.get("LIFEOS_TASK_NODE_ID"),
    )
    value.add_argument(
        "--graph-sha256",
        default=os.environ.get("LIFEOS_GRAPH_SHA256"),
    )
    value.add_argument("--check", action="store_true")
    return value


def expected_report(
    receipts_dir: Path,
    run_id: str,
    release_node_id: str,
    graph_digest: str | None,
) -> dict[str, Any]:
    run_dir = receipts_dir.resolve() / "runs" / run_id
    tasks, observed_run_id = runner.load_snapshot(run_dir, Path.cwd())
    observed_digest = runner.graph_sha256(tasks)
    if observed_run_id != run_id:
        raise runner.RunnerError(
            f"run identity mismatch: expected {run_id}, got {observed_run_id}"
        )
    if graph_digest and observed_digest != graph_digest:
        raise runner.RunnerError(
            f"graph digest mismatch: expected {graph_digest}, got {observed_digest}"
        )
    if release_node_id not in tasks:
        raise runner.RunnerError(
            f"release node is not in frozen graph: {release_node_id}"
        )

    adopted: list[dict[str, Any]] = []
    failures: list[str] = []
    for task in sorted(tasks.values(), key=lambda item: item.node_id):
        if task.node_id == release_node_id:
            continue
        status = runner.prior_status(receipts_dir, task, observed_digest)
        receipt = runner.prior_receipt(receipts_dir, task, observed_digest)
        lifecycle = receipt.get("lifecycle") if receipt else None
        if (
            status != "completed"
            or not isinstance(lifecycle, dict)
            or lifecycle.get("stage") != "completed"
            or lifecycle.get("implementation_proven") is not True
            or lifecycle.get("independent_verification_proven") is not True
            or lifecycle.get("activation_proven") is not True
            or lifecycle.get("adopted") is not True
        ):
            failures.append(f"{task.node_id}:{status}")
            continue
        adopted.append(
            {
                "node_id": task.node_id,
                "task_id": task.task_id,
                "packet_sha256": task.packet_sha256,
                "semantic_contract_sha256": task.semantic_contract_sha256,
                "source_authority": task.source_authority,
                "receipt_sha256": receipt.get("receipt_sha256"),
                "capability_id": (
                    receipt.get("capability", {}).get("capability_id")
                    if isinstance(receipt.get("capability"), dict)
                    else None
                ),
                "adopted_by_node_id": lifecycle.get("adopted_by_node_id"),
                "continued_use_count": lifecycle.get("continued_use_count"),
            }
        )
    if failures:
        preview = ", ".join(failures[:20])
        suffix = "" if len(failures) <= 20 else f" (+{len(failures) - 20} more)"
        raise runner.RunnerError(
            f"unadopted or unproven task capabilities: {preview}{suffix}"
        )

    manifest = json.loads((run_dir / "graph.json").read_text(encoding="utf-8"))
    reconciliation = manifest.get("reconciliation")
    return {
        "schema": "lifeos.unified-capability-adoption-report.v1",
        "run_id": run_id,
        "graph_sha256": observed_digest,
        "release_node_id": release_node_id,
        "source_packet_instance_count": len(tasks),
        "completed_before_release_count": len(adopted),
        "all_predecessor_capabilities_adopted": len(adopted) == len(tasks) - 1,
        "reconciliation": reconciliation,
        "adopted_capabilities": adopted,
    }


def main() -> int:
    args = parser().parse_args()
    if not args.run_id or not args.release_node_id:
        print(
            "run id and release node id are required",
            file=sys.stderr,
        )
        return 2
    try:
        report = expected_report(
            args.receipts_dir,
            args.run_id,
            args.release_node_id,
            args.graph_sha256,
        )
        output = args.receipts_dir.resolve() / "runs" / args.run_id / (
            "capability-adoption-report.json"
        )
        rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
        if args.check:
            if not output.is_file() or output.read_text(encoding="utf-8") != rendered:
                raise runner.RunnerError(
                    f"capability adoption report is missing or stale: {output}"
                )
        else:
            runner.atomic_write_bytes(output, rendered.encode("utf-8"))
        print(
            f"verified {len(report['adopted_capabilities'])} adopted capabilities "
            f"for graph {report['graph_sha256']}"
        )
        return 0
    except (OSError, json.JSONDecodeError, runner.RunnerError) as error:
        print(f"capability-adoption: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
