import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BASH, engine } from "./helpers/yzx-envelope";

// ARCHBP-068 — Bind meta/var, postgres datadir, and the relocated runtime
// path into the sandbox. (yzx-iso t2-5-durable-mounts, G2; depends on the
// t3 tier map: planning-spine-v0/docs/isolation_tier_map.json.)

const META_VAR = "/home/flexnetos/meta/var";

describe("ARCHBP-068 durable-state binds", () => {
  test("meta/var and the postgres datadir are visible inside the envelope", () => {
    expect(existsSync(META_VAR)).toBe(true);
    const r = engine([
      "enter", "--id", "t068-vis",
      "--durable", `${META_VAR}:/durable/meta-var`,
      "--", BASH, "-c",
      "ls /durable/meta-var | head -20; test -d /durable/meta-var/lib && echo lib-tier-visible",
    ]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("lib-tier-visible");
    // The durable lib tier hosts the postgres datadir per the tier map.
    expect(r.stdout).toMatch(/lib/);
  }, 60000);

  test("writes to a durable bind persist across envelope exit", () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp068-"));
    try {
      const r = engine([
        "enter", "--id", "t068-persist",
        "--durable", `${dir}:/durable/state`,
        "--", BASH, "-c", "echo durable-byte > /durable/state/marker",
      ]);
      expect(r.status, r.stderr).toBe(0);
      // The envelope is gone; the write persisted on the durable plane.
      expect(readFileSync(join(dir, "marker"), "utf8").trim()).toBe("durable-byte");
      const check = engine(["leakcheck", "t068-persist"]);
      expect(JSON.parse(check.stdout.trim()).clean).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  test("the tier map (t3 dependency) declares the bound durable roots", () => {
    const map = JSON.parse(
      readFileSync("planning-spine-v0/docs/isolation_tier_map.json", "utf8"),
    );
    const durablePaths = map.entries
      .filter((e: { tier: string }) => e.tier === "durable")
      .map((e: { target_path: string }) => e.target_path);
    expect(durablePaths.some((p: string) => p.includes("meta/var/lib/postgresql"))).toBe(true);
    expect(durablePaths.some((p: string) => p.includes("meta/var"))).toBe(true);
  });
});
