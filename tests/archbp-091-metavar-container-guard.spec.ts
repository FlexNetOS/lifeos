import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

// ARCHBP-091 — Assertion/test preventing meta/var from being mounted into
// docker/containerd. (yzx-iso t6, G9; invariant I15.)

const repoRoot = resolve(import.meta.dirname, "..");
const guard = resolve(repoRoot, "scripts/check-metavar-not-in-containers.mjs");
const run = (args: string[]) =>
  spawnSync("bun", [guard, ...args], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });

describe("ARCHBP-091 meta/var container-mount guard", () => {
  test("the guard runs in CI against the live host mount table and passes", () => {
    const r = run([]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("PASS");
    expect(r.stdout).toMatch(/\d+ mounts scanned/);
    // The verification boundary is stated, not hidden.
    expect(r.stdout).toContain("verification boundary");
  });

  test("fails on violation: meta/var in overlay layers or bound into a container root", () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp091-"));
    try {
      const fixture = [
        "overlay /var/lib/docker/rootfs/overlayfs/deadbeef overlay rw,lowerdir=/home/flexnetos/meta/var/lib/postgresql:/x,upperdir=/y,workdir=/z 0 0",
        "/home/flexnetos/meta/var /var/lib/docker/volumes/evil/_data none rw,bind 0 0",
      ].join("\n");
      const p = join(dir, "mounts");
      writeFileSync(p, fixture);
      const r = run(["--mounts", p]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("VIOLATION");
      expect(r.stderr).toContain("overlay layers reference meta/var");
      expect(r.stderr).toContain("meta/var bound into container root");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the live scan sees the existing container surface (Omada moby) without violations", () => {
    const r = run([]);
    // The 98ade093 Omada container's overlay is host-visible today; the
    // guard proves meta/var is not part of it. After the T6 cutover the
    // container-surface count drops to zero and the guard passes harder.
    expect(r.stdout).toMatch(/container-surface mounts, 0 violations/);
  });
});
