from __future__ import annotations

"""Register the existing ART-130 report in the persistent envctl registry."""

import hashlib
import json
import sqlite3
from pathlib import Path

from _common import append_proof, make_proof, now, package_root, root
from artifact_registry import ArtifactRegistry, fetch_artifact


TASK_ID = "ART-130_SHADOW_TRAFFIC"
HELPER_ID = "helper-artifact-31"
MODEL_TAG = "gpt-5.3-spark"
RUN_ID = "run-art130-shadow-traffic"
OPERATION_ID = "produce-06-testing-validation-shadow-traffic-comparison-report-md"
CONTRACT_ID = "contract-full-migration-artifact-contract-1.0.0"
RECIPE_ID = "recipe-flexnetos-package-artifact-contract-1.0.0"
TARGET_ROW_ID = "target-art-115-flexnetos-vs-lifeos"

ARTIFACT_DIR = root() / "migration-artifacts" / "art-130_shadow_traffic"
TASK_MD = ARTIFACT_DIR / "shadow-traffic-comparison-report.md"
TASK_JSON = ARTIFACT_DIR / "shadow-traffic-comparison-report.json"
CANONICAL_MD = root() / "migration-artifacts" / "06-testing-validation" / "shadow-traffic-comparison-report.md"
REPORT_JSON = root() / "generated" / "art130_shadow_traffic_registry_report.json"


def rel(path: Path) -> str:
    return str(path.relative_to(package_root()))


def sha256_text(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def ensure_run(conn: sqlite3.Connection) -> None:
    target = conn.execute("SELECT 1 FROM envctl_migration_targets WHERE id = ?", (TARGET_ROW_ID,)).fetchone()
    contract = conn.execute("SELECT 1 FROM envctl_migration_artifact_contracts WHERE id = ?", (CONTRACT_ID,)).fetchone()
    recipe = conn.execute("SELECT 1 FROM envctl_migration_recipes WHERE id = ?", (RECIPE_ID,)).fetchone()
    if not target or not contract or not recipe:
        raise RuntimeError("ART-130 requires the registered target, recipe, and artifact contract")
    conn.execute(
        """
        INSERT INTO envctl_migration_runs
          (id, target_id, recipe_id, artifact_contract_id, status, human_mode, initiated_by,
           sandbox_policy, approval_policy, tool_versions_json, reproducibility_hash,
           started_at_utc, completed_at_utc)
        VALUES (?, ?, ?, ?, 'completed', 'approval-gated', 'artifact-agent',
                'workspace-write', 'never', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status, completed_at_utc=excluded.completed_at_utc
        """,
        (RUN_ID, TARGET_ROW_ID, RECIPE_ID, CONTRACT_ID, json.dumps({"python": "stdlib", "sqlite": "stdlib"}),
         sha256_text(TASK_ID + ":register"), now(), now()),
    )
    conn.execute(
        """
        INSERT INTO envctl_migration_operations
          (id, run_id, operation_type, phase, status, risk, idempotency_key, command_hash,
           command_redacted, input_json, started_at_utc, completed_at_utc)
        VALUES (?, ?, 'produce_artifact_record', '05-artifacts', 'succeeded', 'R2', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status, completed_at_utc=excluded.completed_at_utc
        """,
        (OPERATION_ID, RUN_ID, f"{TASK_ID}/generate-and-register",
         sha256_text("python3 scripts/register_art130_shadow_traffic.py"),
         "python3 scripts/register_art130_shadow_traffic.py",
         json.dumps({"task_id": TASK_ID, "contract_row_id": "artifact:06-testing-validation-shadow-traffic-comparison-report-md"}),
         now(), now()),
    )
    conn.commit()


def register(conn: sqlite3.Connection, payload: dict) -> list[dict]:
    capture_status = payload["traffic_capture"]["capture_status"]
    common = {
        "run_id": RUN_ID, "status": "complete", "producer_operation_id": OPERATION_ID,
        "contract_id": CONTRACT_ID,
        "provenance": {"task_id": TASK_ID, "owner_agent": "artifact-agent", "helper_id": HELPER_ID,
                       "contract_row_id": "artifact:06-testing-validation-shadow-traffic-comparison-report-md",
                       "capture_status": capture_status},
        "evidence_refs": [rel(TASK_MD), rel(TASK_JSON), rel(CANONICAL_MD),
            "execution-framework/generated/envctl_migration_db_validation_report.json",
            "execution-framework/generated/envctl_artifact_registry_report.json",
            "execution-framework/schemas/shared_protocol.schema.json",
            "execution-framework/proof_records/REQ-024_ENVCTL_ARTIFACT_REGISTRY.proof.json",
            "execution-framework/proof_records/REQ-040_SHARED_PROTOCOL_SCHEMAS.proof.json"],
        "links": [{"to": "artifact:06-testing-validation-shadow-traffic-comparison-report-md", "type": "satisfies_contract_row"},
                  {"to": "REQ-024_ENVCTL_ARTIFACT_REGISTRY", "type": "depends_on"},
                  {"to": "REQ-040_SHARED_PROTOCOL_SCHEMAS", "type": "depends_on"},
                  {"to": "VER-300_UNIT_VALIDATION", "type": "blocks"}],
        "validations": [
            {"validator": "art130:path-registered", "status": "pass",
             "details": {"paths": [rel(TASK_MD), rel(TASK_JSON), rel(CANONICAL_MD)]},
             "evidence_refs": [rel(TASK_MD), rel(TASK_JSON), rel(CANONICAL_MD)]},
            {"validator": "art130:hash-recorded", "status": "pass",
             "details": {"registry": "envctl_migration_artifacts.content_hash"},
             "evidence_refs": [rel(TASK_MD), rel(TASK_JSON), rel(CANONICAL_MD)]},
            {"validator": "art130:validation-evidence-linked", "status": "pass",
             "details": {"registry": "envctl_migration_validations and envctl_migration_evidence"},
             "evidence_refs": ["execution-framework/generated/envctl_artifact_registry_report.json", rel(TASK_JSON)]},
            {"validator": "art130:real-traffic-capture", "status": "warn",
             "details": {"capture_status": capture_status, "runtime_parity_certified": False},
             "evidence_refs": [rel(TASK_JSON)]},
        ],
    }
    records = [
        {**common, "artifact_id": "art-130-shadow-traffic-report-md", "title": "ART-130 Shadow Traffic Comparison Report", "artifact_type": "validation_evidence", "path": rel(TASK_MD)},
        {**common, "artifact_id": "art-130-shadow-traffic-report-json", "title": "ART-130 Shadow Traffic Comparison Machine Report", "artifact_type": "validation_evidence", "path": rel(TASK_JSON)},
        {**common, "artifact_id": "06-testing-validation-shadow-traffic-comparison-report-md", "title": "Shadow Traffic Comparison Report", "artifact_type": "validation_evidence", "path": rel(CANONICAL_MD)},
    ]
    registry = ArtifactRegistry(conn, package_root())
    return [registry.register(record) for record in records]


def main() -> int:
    payload = json.loads(TASK_JSON.read_text(encoding="utf-8"))
    if not all(path.is_file() for path in (TASK_MD, TASK_JSON, CANONICAL_MD)):
        raise RuntimeError("ART-130 report files are missing")
    db = root() / "generated" / "envctl.db"
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    ensure_run(conn)
    results = register(conn, payload)
    rows = [fetch_artifact(conn, RUN_ID, result["artifact_id"]) for result in results]
    hashes_ok = all(row["content_hash"] == result["content_hash"] for row, result in zip(rows, results))
    completion_gate = {
        "artifact_exists": True,
        "registry_contains_hash": hashes_ok,
        "validation_evidence_linked": all(
            row["evidence"].get("validation_ids") for row in rows
        ),
    }
    passed = all(completion_gate.values())
    report = {"schema_version": "1.0", "task_id": TASK_ID, "generated_at": now(),
              "status": "passed" if passed else "failed", "registry_results": results,
              "artifact_rows": rows,
              "completion_gate": completion_gate,
              "warnings": ["No mirrored live traffic payloads were supplied; runtime parity is not certified."],
              "evidence": [rel(TASK_MD), rel(TASK_JSON), rel(CANONICAL_MD)]}
    conn.close()
    REPORT_JSON.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (root() / "logs" / f"{TASK_ID}.log").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (root() / "state" / f"{TASK_ID}.heartbeat.json").write_text(json.dumps({"task_id": TASK_ID, "status": "completed" if passed else "failed", "updated_at": report["generated_at"], "proof_uri": f"proof_records/{TASK_ID}.proof.json", "completion_gate": report["completion_gate"]}, indent=2) + "\n", encoding="utf-8")
    files = ["execution-framework/scripts/register_art130_shadow_traffic.py", rel(TASK_MD), rel(TASK_JSON), rel(CANONICAL_MD), "execution-framework/generated/art130_shadow_traffic_registry_report.json", f"execution-framework/logs/{TASK_ID}.log", f"execution-framework/state/{TASK_ID}.heartbeat.json", f"execution-framework/proof_records/{TASK_ID}.proof.json", "execution-framework/proof_records/proof_ledger.jsonl"]
    proof = make_proof(TASK_ID, "completed" if passed else "failed", "artifact-agent", HELPER_ID, MODEL_TAG, str(package_root()), files, ["python3 scripts/register_art130_shadow_traffic.py", "python3 -m py_compile scripts/register_art130_shadow_traffic.py"], report, report["evidence"], "" if passed else "ART-130 completion gate failed", "capture mirrored redacted production traffic before runtime parity certification")
    append_proof(proof)
    print(json.dumps({"status": report["status"], "completion_gate": report["completion_gate"]}, sort_keys=True))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
