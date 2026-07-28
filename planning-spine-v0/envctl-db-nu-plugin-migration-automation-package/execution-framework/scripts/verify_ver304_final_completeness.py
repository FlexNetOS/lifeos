#!/usr/bin/env python3
"""Verify that every blueprint-bound source requirement has exactly one task.

This is deliberately separate from the full implementation-lifecycle gate.  A
source requirement is covered when its immutable anchor binding is represented
by one task-graph row and the corresponding execution packet.  A drift or
capability obligation may still be blocked for implementation evidence; that
does not erase its task coverage.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from _common import append_proof, make_proof, now, read_json, root, write_json


TASK_ID = "VER-304_FINAL_COMPLETENESS"
ANCHOR = "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md"
REPORT = "generated/ver304_final_completeness_report.json"
HEARTBEAT = "state/VER-304_FINAL_COMPLETENESS.heartbeat.json"
LOG = "logs/VER-304_FINAL_COMPLETENESS.log"


def binding(value: object) -> dict[str, object]:
    if isinstance(value, str):
        return json.loads(value)
    return value if isinstance(value, dict) else {}


def main() -> None:
    framework = root()
    source_root = next(
        (candidate for candidate in framework.parents if (candidate / ANCHOR).is_file()),
        None,
    )
    if source_root is None:
        raise FileNotFoundError(f"source blueprint not found above {framework}: {ANCHOR}")
    graph = read_json("generated/task_graph.normalized.json")
    rows = graph["tasks"]
    packets = sorted((framework / "generated/execution_packets").glob("*.json"))
    packet_ids = {path.stem for path in packets}
    graph_ids = {row["task_id"] for row in rows}
    anchor_sha = hashlib.sha256((source_root / ANCHOR).read_bytes()).hexdigest()

    bound_rows = [row for row in rows if row.get("anchor_binding")]
    bindings = [(row["task_id"], binding(row["anchor_binding"])) for row in bound_rows]
    requirement_hashes = [
        item.get("unit_sha256") or item.get("invariant_sha256")
        for _, item in bindings
    ]
    packet_bindings: dict[str, dict[str, object]] = {}
    parse_errors: list[str] = []
    for task_id, _ in bindings:
        path = framework / "generated/execution_packets" / f"{task_id}.json"
        try:
            packet_bindings[task_id] = read_json(path).get("anchor_binding", {})
        except (OSError, json.JSONDecodeError) as error:
            parse_errors.append(f"{task_id}: {error}")

    missing_packets = sorted(graph_ids - packet_ids)
    unexpected_packets = sorted(packet_ids - graph_ids)
    missing_requirement_hashes = sorted(task_id for task_id, item in bindings if not (
        item.get("unit_sha256") or item.get("invariant_sha256")
    ))
    duplicate_requirement_hashes = len(requirement_hashes) - len(set(requirement_hashes))
    stale_anchor_bindings = sorted(task_id for task_id, item in bindings if item.get("document_sha256") != anchor_sha)
    binding_mismatches = sorted(task_id for task_id, item in bindings if packet_bindings.get(task_id) != item)
    source_coverage_passed = not any((
        missing_packets,
        unexpected_packets,
        missing_requirement_hashes,
        duplicate_requirement_hashes,
        stale_anchor_bindings,
        binding_mismatches,
        parse_errors,
    ))

    full_report = read_json("generated/final_verification_report.json")
    report = {
        "schema_version": "1.0",
        "task_id": TASK_ID,
        "generated_at": now(),
        "status": "pass" if source_coverage_passed else "failed",
        "scope": "source-requirement-to-task coverage",
        "source_coverage_passed": source_coverage_passed,
        "counts": {
            "task_graph_rows": len(rows),
            "execution_packets": len(packets),
            "blueprint_bound_requirements": len(bound_rows),
            "unique_requirement_hashes": len(set(requirement_hashes)),
        },
        "missing_packets": missing_packets,
        "unexpected_packets": unexpected_packets,
        "missing_requirement_hashes": missing_requirement_hashes,
        "duplicate_requirement_hash_count": duplicate_requirement_hashes,
        "stale_anchor_bindings": stale_anchor_bindings,
        "packet_binding_mismatches": binding_mismatches,
        "packet_parse_errors": parse_errors,
        "explicit_blockers_for_source_coverage": [],
        "full_lifecycle_gate": {
            "status": full_report.get("status"),
            "goal_loop_complete": full_report.get("goal_loop_complete"),
            "unresolved_implementation_obligation_count": full_report.get("unresolved_implementation_obligation_count"),
            "nonimplementation_completion_proof_count": full_report.get("nonimplementation_completion_proof_count"),
            "external_blockers": full_report.get("external_blockers", []),
        },
        "interpretation": (
            "Source coverage passes independently. The full lifecycle gate is reported "
            "separately and must not be treated as implementation completion."
        ),
    }
    write_json(REPORT, report)
    write_json(HEARTBEAT, {
        "schema_version": "1.0", "task_id": TASK_ID,
        "status": report["status"], "updated_at": now(),
        "proof_uri": f"proof_records/{TASK_ID}.proof.json", "validation_report": REPORT,
    })
    (framework / LOG).write_text(
        f"{TASK_ID} source_coverage={report['status']} "
        f"requirements={len(bound_rows)} packets={len(packets)}\n",
        encoding="utf-8",
    )
    proof = make_proof(
        TASK_ID,
        "completed" if source_coverage_passed else "failed",
        "final-completeness-agent",
        "helper-complete-01",
        "gpt-5.3-spark",
        "..",
        [
            "execution-framework/scripts/verify_ver304_final_completeness.py",
            "execution-framework/generated/ver304_final_completeness_report.json",
            "execution-framework/state/VER-304_FINAL_COMPLETENESS.heartbeat.json",
            "execution-framework/logs/VER-304_FINAL_COMPLETENESS.log",
            "execution-framework/proof_records/VER-304_FINAL_COMPLETENESS.proof.json",
        ],
        ["python3 scripts/verify_history_and_completeness.py", "python3 scripts/verify_ver304_final_completeness.py"],
        report,
        [REPORT, HEARTBEAT, LOG],
        "" if source_coverage_passed else "source coverage discrepancies are listed in the report",
        "resolve every listed source-coverage discrepancy and rerun" if not source_coverage_passed else "resolve full lifecycle blockers before release",
    )
    append_proof(proof)
    print(f"{TASK_ID} source coverage: {report['status']}")
    if not source_coverage_passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
