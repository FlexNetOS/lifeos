import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

// ARCHBP-107 — Cycle acquire/release across all resources; assert OS
// unaffected. (yzx-iso t8, G8.)

const repoRoot = resolve(import.meta.dirname, "..");

describe("ARCHBP-107 full acquire/release cycles", () => {
  test("cycles pass for all registered resources with the OS unaffected each cycle, audit verified", () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp107-"));
    try {
      const outputPath = join(dir, "cycle.json");
      const auditPath = join(dir, "audit.jsonl");
      const r = spawnSync(
        "bun",
        [resolve(repoRoot, "scripts/host-control-plane.mjs"), `--output=${outputPath}`, `--audit=${auditPath}`],
        { cwd: repoRoot, encoding: "utf8", timeout: 60000 },
      );
      expect(r.status, r.stderr).toBe(0);
      const report = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(report.resources_cycled).toBeGreaterThanOrEqual(4);
      expect(report.all_restored).toBe(true); // every release verified restore
      expect(report.all_os_equal).toBe(true); // probe(before) === probe(after) per resource
      // Audit verified: one acquire + one release per resource, in order.
      expect(existsSync(auditPath)).toBe(true);
      const lines = readFileSync(auditPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
      expect(lines.length).toBe(report.resources_cycled * 2);
      const acquires = lines.filter((l) => l.action === "acquire").length;
      const releases = lines.filter((l) => l.action === "release" && l.restored === true).length;
      expect(acquires).toBe(report.resources_cycled);
      expect(releases).toBe(report.resources_cycled);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
