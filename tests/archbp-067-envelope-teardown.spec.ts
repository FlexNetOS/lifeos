import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { BASH, engine } from "./helpers/yzx-envelope";

// ARCHBP-067 — Teardown mounts + acquired resources with zero leaks on exit.
// (yzx-iso t2-4-exit-release, G2.)

const hostMounts = () => readFileSync("/proc/mounts", "utf8");

describe("ARCHBP-067 envelope teardown", () => {
  test("all envelope mounts unwind on exit — host mount table unchanged", () => {
    const before = hostMounts();
    const r = engine([
      "enter", "--id", "t067-mounts", "--gpu", "--", BASH, "-c",
      "echo scratch > /tmp/inside; wc -l < /proc/self/mounts",
    ]);
    expect(r.status, r.stderr).toBe(0);
    expect(Number(r.stdout.trim())).toBeGreaterThan(10); // envelope had its own mounts
    expect(hostMounts()).toBe(before); // namespace-scoped: zero residue on the host
  }, 60000);

  test("no dangling namespaces or processes after exit (leakcheck clean)", () => {
    const run = engine(["enter", "--id", "t067-leak", "--", BASH, "-c", "true"]);
    expect(run.status, run.stderr).toBe(0);
    const check = engine(["leakcheck", "t067-leak"]);
    expect(check.status, check.stderr).toBe(0);
    const j = JSON.parse(check.stdout.trim());
    expect(j.leaked_processes).toBe(0);
    expect(j.host_mount_residue).toBe(0);
    expect(j.clean).toBe(true);
  }, 60000);

  test("acquired resources release: isolated-net envelope leaves host networking untouched", () => {
    const before = readFileSync("/proc/net/dev", "utf8").split("\n").length;
    const r = engine(["enter", "--id", "t067-net", "--isolate-net", "--", BASH, "-c", "true"]);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync("/proc/net/dev", "utf8").split("\n").length).toBe(before);
  }, 60000);
});
