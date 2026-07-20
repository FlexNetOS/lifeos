import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { buildNavigationArtifacts } from "../planning-spine-v0/scripts/build-navigation-index.mjs";

const repoRoot = process.cwd();
const pkgRoot = path.join(repoRoot, "planning-spine-v0");
const fixtureDir = path.join(pkgRoot, "proof_records", "fixtures", "duplicate-revision-digest");
const realLedgerPath = path.join(pkgRoot, "proof_records", "proof_ledger.jsonl");
const temporaryDirectories = [];

// The two historical GRAPH-005 revision-1 identities (same task, same revision,
// different proof_sha256). The committed fixture holds byte-exact copies of the
// two conflicting ledger lines; both must stay byte-preserved in the committed
// ledger forever (append-only contract).
const SUPERSEDED_SHA = "1d06edc08b843edf17684b6ca2caf7ac5cd32c2615cee3da2ffed3f598ac4e3c";
const ACCEPTED_SHA = "e991b760e43417667dc47c45131be4c50f74aaa9d15c28270feee6393b666efa";
// Matches the committed generated_at of generated/task_graph.status.json.
const STATUS_SOURCE_DATE_EPOCH = "1784505600";

function fixture(name) {
  return path.join(fixtureDir, name);
}

const [ORIGINAL_LINE_185, ORIGINAL_LINE_241] = fs
  .readFileSync(fixture("unresolved.ledger.jsonl"), "utf8")
  .split("\n");

function tempDir(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function mergeProofRecords(args, env = {}) {
  return spawnSync(
    "python3",
    ["planning-spine-v0/scripts/merge-proof-records.py", ...args],
    { cwd: repoRoot, encoding: "utf8", env: { ...process.env, ...env } },
  );
}

function updateStatus(args, env = {}) {
  return spawnSync(
    "python3",
    ["planning-spine-v0/scripts/update-task-graph-status.py", ...args],
    { cwd: repoRoot, encoding: "utf8", env: { ...process.env, ...env } },
  );
}

function minimalProofDir() {
  const directory = tempDir("lifeos-ledger-proofs-");
  fs.writeFileSync(path.join(directory, "FIXTURE-001.proof.json"), `${JSON.stringify({
    schema_version: "lifeos-planning-spine.proof-record.v0",
    task_id: "FIXTURE-001",
    observed_at: "2026-07-14T00:00:00Z",
    revision: 1,
    status: "pass",
  }, null, 2)}\n`);
  return directory;
}

function acceptedProofDir() {
  const directory = tempDir("lifeos-ledger-accepted-");
  fs.copyFileSync(
    path.join(pkgRoot, "proof_records", "GRAPH-005.proof.json"),
    path.join(directory, "GRAPH-005.proof.json"),
  );
  return directory;
}

function reportPath() {
  return path.join(tempDir("lifeos-ledger-report-"), "report.json");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("proof-ledger duplicate revision identities (ARCHBP-035)", () => {
  it("fixture lines carry the two conflicting GRAPH-005 identities", () => {
    expect(JSON.parse(ORIGINAL_LINE_185)).toMatchObject({
      task_id: "GRAPH-005",
      revision: "1",
      sequence: 185,
      proof_sha256: SUPERSEDED_SHA,
    });
    expect(JSON.parse(ORIGINAL_LINE_241)).toMatchObject({
      task_id: "GRAPH-005",
      revision: "1",
      sequence: 241,
      proof_sha256: ACCEPTED_SHA,
    });
  });

  describe("merge reader", () => {
    it("rejects an unresolved same-task same-revision digest conflict naming both identities", () => {
      const result = mergeProofRecords([
        minimalProofDir(),
        "--ledger", fixture("unresolved.ledger.jsonl"),
        "--report", reportPath(),
        "--dry-run",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("GRAPH-005");
      expect(result.stderr).toContain("revision 1");
      expect(result.stderr).toContain(SUPERSEDED_SHA);
      expect(result.stderr).toContain(ACCEPTED_SHA);
      expect(result.stderr).toContain("conflict-resolved");
    });

    it("accepts an append-only resolved ledger and skips the accepted proof digest", () => {
      const report = reportPath();
      const result = mergeProofRecords([
        acceptedProofDir(),
        "--ledger", fixture("resolved.ledger.jsonl"),
        "--report", report,
        "--dry-run",
      ]);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const parsed = JSON.parse(fs.readFileSync(report, "utf8"));
      expect(parsed.appended_entry_count).toBe(0);
      expect(parsed.skipped_entries).toEqual([
        expect.objectContaining({ task_id: "GRAPH-005", revision: "1" }),
      ]);
    });

    it("rejects a resolution record whose identities do not match the ledger lines", () => {
      const result = mergeProofRecords([
        minimalProofDir(),
        "--ledger", fixture("bad-identities.ledger.jsonl"),
        "--report", reportPath(),
        "--dry-run",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/resolution/i);
      expect(result.stderr).toContain("GRAPH-005");
    });

    it("rejects a resolution record when the ledger has no digest conflict to resolve", () => {
      const result = mergeProofRecords([
        minimalProofDir(),
        "--ledger", fixture("no-conflict.ledger.jsonl"),
        "--report", reportPath(),
        "--dry-run",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/resolution/i);
    });
  });

  describe("audit reader", () => {
    it("reports the unresolved conflict with both identities and fails closed", () => {
      const result = mergeProofRecords(["--audit", "--ledger", fixture("unresolved.ledger.jsonl")]);

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.result).toBe("fail");
      expect(report.unresolved_conflicts).toEqual([
        expect.objectContaining({
          task_id: "GRAPH-005",
          revision: "1",
          identities: [
            expect.objectContaining({ sequence: 185, proof_sha256: SUPERSEDED_SHA }),
            expect.objectContaining({ sequence: 241, proof_sha256: ACCEPTED_SHA }),
          ],
        }),
      ]);
    });

    it("agrees on the accepted identity once an append-only resolution exists", () => {
      const result = mergeProofRecords(["--audit", "--ledger", fixture("resolved.ledger.jsonl")]);

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.result).toBe("pass");
      expect(report.unresolved_conflicts).toEqual([]);
      expect(report.resolved_conflicts).toEqual([
        expect.objectContaining({
          task_id: "GRAPH-005",
          revision: "1",
          accepted_sequence: 241,
          accepted_proof_sha256: ACCEPTED_SHA,
        }),
      ]);
    });
  });

  describe("status reader", () => {
    it("rejects unresolved conflicts instead of silently selecting a digest", () => {
      const output = path.join(tempDir("lifeos-ledger-status-"), "status.json");
      const result = updateStatus([
        "planning-spine-v0/generated/task_graph.normalized.json",
        "--ledger", fixture("unresolved.ledger.jsonl"),
        "-o", output,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("GRAPH-005");
      expect(result.stderr).toMatch(/conflict/i);
      expect(fs.existsSync(output)).toBe(false);
    });

    it("projects the accepted identity from a resolved ledger", () => {
      const output = path.join(tempDir("lifeos-ledger-status-"), "status.json");
      const result = updateStatus([
        "planning-spine-v0/generated/task_graph.normalized.json",
        "--ledger", fixture("resolved.ledger.jsonl"),
        "-o", output,
      ]);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const status = JSON.parse(fs.readFileSync(output, "utf8"));
      const graph005 = status.tasks.find((task) => task.task_id === "GRAPH-005");
      expect(graph005.effective.status).toBe("complete");
      expect(graph005.proof).toMatchObject({
        status: "pass",
        revision: "1",
        sha256: ACCEPTED_SHA,
        ledger_line_number: 2,
      });
    });
  });

  describe("navigation reader", () => {
    it("fails closed on unresolved conflicts and passes once the resolution is appended", () => {
      const temporaryBase = tempDir("lifeos-ledger-navigation-");
      const isolatedRoot = path.join(temporaryBase, "lifeos");
      fs.mkdirSync(isolatedRoot);
      fs.cpSync(pkgRoot, path.join(isolatedRoot, "planning-spine-v0"), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, "AGENTS.md"), path.join(isolatedRoot, "AGENTS.md"));
      const isolatedLedger = path.join(isolatedRoot, "planning-spine-v0", "proof_records", "proof_ledger.jsonl");

      fs.copyFileSync(fixture("unresolved.ledger.jsonl"), isolatedLedger);
      const unresolved = buildNavigationArtifacts({ repoRoot: isolatedRoot });
      expect(unresolved.validation.result).toBe("fail");
      expect(unresolved.validation.checks).toContainEqual(
        expect.objectContaining({ name: "ledger_revision_conflicts_resolved", result: "fail" }),
      );
      expect(unresolved.validation.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("GRAPH-005"),
      ]));

      fs.copyFileSync(fixture("resolved.ledger.jsonl"), isolatedLedger);
      const resolved = buildNavigationArtifacts({ repoRoot: isolatedRoot });
      expect(resolved.validation.checks).toContainEqual(
        expect.objectContaining({ name: "ledger_revision_conflicts_resolved", result: "pass" }),
      );
      expect(resolved.validation.errors).toEqual([]);
      expect(resolved.validation.result).toBe("pass");
    }, 360_000);
  });

  describe("committed ledger resolution", () => {
    it("preserves both historical GRAPH-005 identities byte-for-byte", () => {
      const lines = fs.readFileSync(realLedgerPath, "utf8").split("\n");
      expect(lines[184]).toBe(ORIGINAL_LINE_185);
      expect(lines[240]).toBe(ORIGINAL_LINE_241);
    });

    it("resolves every duplicate-revision conflict via verifier records that match the on-disk proofs", () => {
      const result = mergeProofRecords(["--audit", "--ledger", "planning-spine-v0/proof_records/proof_ledger.jsonl"]);

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.result).toBe("pass");
      expect(report.unresolved_conflicts).toEqual([]);
      expect(report.resolved_conflicts.length).toBeGreaterThanOrEqual(18);

      const graph005 = report.resolved_conflicts.find((conflict) => conflict.task_id === "GRAPH-005");
      expect(graph005).toMatchObject({
        revision: "1",
        accepted_sequence: 241,
        accepted_proof_sha256: ACCEPTED_SHA,
      });
      expect(graph005.identities.map((identity) => identity.proof_sha256).sort()).toEqual(
        [SUPERSEDED_SHA, ACCEPTED_SHA].sort(),
      );
      expect(graph005.verified_by).toBeTruthy();

      for (const conflict of report.resolved_conflicts) {
        const proofPath = path.join(pkgRoot, "proof_records", `${conflict.task_id}.proof.json`);
        const onDisk = crypto.createHash("sha256").update(fs.readFileSync(proofPath)).digest("hex");
        expect(conflict.accepted_proof_sha256, conflict.task_id).toBe(onDisk);
      }
    });

    it("keeps new proof merges unblocked against the committed ledger", () => {
      const result = mergeProofRecords([
        "planning-spine-v0/proof_records",
        "--ledger", "planning-spine-v0/proof_records/proof_ledger.jsonl",
        "--report", reportPath(),
        "--dry-run",
      ]);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    });

    it("projects the committed status file byte-for-byte from the resolved ledger", () => {
      const output = path.join(tempDir("lifeos-ledger-status-"), "status.json");
      // Committed status.json records generator paths relative to planning-spine-v0.
      const result = spawnSync(
        "python3",
        [
          "scripts/update-task-graph-status.py",
          "generated/task_graph.normalized.json",
          "--ledger", "proof_records/proof_ledger.jsonl",
          "-o", output,
        ],
        {
          cwd: pkgRoot,
          encoding: "utf8",
          env: { ...process.env, SOURCE_DATE_EPOCH: STATUS_SOURCE_DATE_EPOCH },
        },
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const committed = fs.readFileSync(path.join(pkgRoot, "generated", "task_graph.status.json"), "utf8");
      expect(fs.readFileSync(output, "utf8")).toBe(committed);
    });
  });
});
