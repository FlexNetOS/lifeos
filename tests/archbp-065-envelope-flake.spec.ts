import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { YAZELIX_ROOTS } from "./helpers/yzx-envelope";

// ARCHBP-065 — Package the envelope as a flake app/package so it is
// nix-declared, not ad-hoc. (yzx-iso t2-2-flake-integration, G2.)

const root = YAZELIX_ROOTS.find((r) => existsSync(`${r}/envelope/yzx-envelope.sh`));

describe("ARCHBP-065 nix-declared envelope", () => {
  test("the bwrap wrapper builds via the yazelix flake with no host installs", () => {
    expect(root, "yazelix envelope checkout missing").toBeTruthy();
    const build = spawnSync(
      "nix",
      ["build", ".#yzx-envelope", "--no-link", "--print-out-paths"],
      { cwd: root, encoding: "utf8", timeout: 300000 },
    );
    expect(build.status, build.stderr).toBe(0);
    const out = build.stdout.trim().split("\n").pop() as string;
    expect(out.startsWith("/nix/store/")).toBe(true);
    // The built app runs and reports its executor honestly.
    const exec = spawnSync(`${out}/bin/yzx-envelope`, ["executor"], {
      encoding: "utf8",
      timeout: 30000,
    });
    expect(exec.status, exec.stderr).toBe(0);
    const j = JSON.parse(exec.stdout.trim());
    expect(typeof j.executor).toBe("string");
    expect(j.executor.length).toBeGreaterThan(0);
    // Honest-downgrade contract: a blocked candidate is recorded with a
    // reason, never silently dropped.
    expect(Array.isArray(j.blocked)).toBe(true);
    expect(typeof j.reason).toBe("string");
  }, 300000);

  test("the flake pins the bubblewrap input and exposes the app", () => {
    const flake = readFileSync(`${root}/flake.nix`, "utf8");
    expect(flake).toContain("yzx-envelope");
    expect(flake).toContain("pkgs.bubblewrap");
    expect(flake).toContain("writeShellApplication");
  });
});
