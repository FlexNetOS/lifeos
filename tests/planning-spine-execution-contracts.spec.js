import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const temporaryDirectories = [];

function validatePacket(...args) {
  return spawnSync(
    "python3",
    ["planning-spine-v0/scripts/validate-execution-packet.py", ...args],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

function reportPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-packet-validation-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "report.json");
}

function packetPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-execution-packet-"));
  temporaryDirectories.push(directory);
  const packet = path.join(directory, "LPS-015.json");
  fs.writeFileSync(packet, `${JSON.stringify({
    packet_schema_version: "lifeos-planning-spine.execution-packet.v0",
    generated_at: "2026-07-13T00:00:00Z",
    source_graph_uri: "planning-spine-v0/generated/task_graph.normalized.json",
    task_id: "LPS-015",
    owner_agent: "qa-agent",
    cell: "proof-cell",
    verification_gate: "Validator tests pass.",
    rollback_plan: "Discard the validation report.",
    proof_uri: "planning-spine-v0/proof_records/LPS-015.proof.json",
    paths: {
      allowed: ["planning-spine-v0/generated/**"],
      blocked: ["src/**"],
      target_artifacts: ["planning-spine-v0/generated/execution_packet.validation_report.json"],
    },
  }, null, 2)}\n`);
  return packet;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("planning-spine mandatory execution contracts", () => {
  it("requires a pre-execution snapshot in every cell schema instance", () => {
    const schema = JSON.parse(fs.readFileSync(
      path.join(repoRoot, "planning-spine-v0/schemas/cell.schema.json"),
      "utf8",
    ));

    expect(schema.properties.snapshot_boundary.properties.mode).toEqual({
      type: "string",
      const: "required",
    });
  });

  it("requires callers to bind packet validation to the expected task identity", () => {
    const packet = packetPath();

    const missingIdentity = validatePacket(packet, "--report", reportPath());
    expect(missingIdentity.status).toBe(2);
    expect(missingIdentity.stderr).toContain("--expect-task-id");

    const wrongReport = reportPath();
    const wrongIdentity = validatePacket(
      packet,
      "--report",
      wrongReport,
      "--expect-task-id",
      "LPS-014",
    );
    expect(wrongIdentity.status).toBe(1);
    expect(JSON.parse(fs.readFileSync(wrongReport, "utf8"))).toMatchObject({
      result: "fail",
      errors: [{ field: "task_id" }],
    });

    const validReport = reportPath();
    const valid = validatePacket(
      packet,
      "--report",
      validReport,
      "--expect-task-id",
      "LPS-015",
    );
    expect(valid.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(validReport, "utf8"))).toMatchObject({
      result: "pass",
      error_count: 0,
    });
  });

  it("never emits a passing LPS proof summary that says its gate failed", () => {
    for (const taskId of ["LPS-006", "LPS-009", "LPS-011"]) {
      const proof = JSON.parse(fs.readFileSync(
        path.join(repoRoot, `planning-spine-v0/proof_records/${taskId}.proof.json`),
        "utf8",
      ));
      expect(proof.status, taskId).toBe("pass");
      expect(proof.proof_summary, taskId).not.toMatch(
        /gate does not (?:fully )?hold|conversion has not happened|none of these are represented/i,
      );
    }
  });
});
