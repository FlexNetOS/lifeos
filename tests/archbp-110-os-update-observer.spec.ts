import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, test } from "vitest";

// ARCHBP-110 — Hook host update events so LifeOS can observe or gate them
// during active work. Gate: Update events observable; Gating during active
// sessions; Uses T8 control plane. (yzx-iso t9-2, G10.) The unprivileged
// observe+gate machinery is proven here; installing the generated apt hook
// under /etc is root and stays with ARCHBP-111 (/etc mutation is a blocked
// path for this task).

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");
const observer = resolve(repoRoot, "scripts/os-update-observer.mjs");
const scratch = `/home/flexnetos/meta/var/tmp/archbp-110-${process.pid}`;
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const run = (args: string[], timeout = 30000) =>
  execFileSync("bun", [observer, ...args], { encoding: "utf8", timeout });

describe("ARCHBP-110 OS-update observe + gate", () => {
  test("update events are observable from the real host apt history, risk-classified", () => {
    expect(existsSync(observer)).toBe(true);
    const events = JSON.parse(run(["events", "--json"]));
    expect(events.length).toBeGreaterThan(0);
    for (const e of events.slice(0, 5)) {
      expect(e.start, JSON.stringify(e)).toBeTruthy();
      expect(e.actions).toBeTruthy();
    }
    // The 2026-07-21 kernel swap is in the live history and must surface as a
    // desktop-breaking event with the matched pattern cited from the 109 map.
    const kernel = events.find((e: { packages: string[] }) =>
      e.packages.some((p: string) => p.startsWith("linux-image-")));
    expect(kernel, "kernel-swap event missing from live history").toBeTruthy();
    expect(kernel.risk.level).toBe("desktop-breaking");
    expect(kernel.risk.matches.some((m: { pattern: string }) => m.pattern.includes("linux-image"))).toBe(true);
  });

  test("the update timer surface is observable", () => {
    const t = JSON.parse(run(["timers", "--json"]));
    const names = t.timers.map((x: { unit: string }) => x.unit).join(" ");
    expect(names).toContain("apt-daily.timer");
    expect(names).toContain("apt-daily-upgrade.timer");
    for (const timer of t.timers) {
      expect(timer.last ?? timer.next, timer.unit).toBeTruthy();
    }
  });

  test("gating during active work: the hold lease flips the gate decision", async () => {
    mkdirSync(scratch, { recursive: true });
    const args = [`--scratch=${scratch}`];
    // No hold → updates allowed.
    const open = JSON.parse(run(["gate-check", ...args, "--json"]));
    expect(open.decision).toBe("allow");
    // Active work takes the hold → the gate blocks (exit 1, machine-readable).
    const held = JSON.parse(run(["hold", ...args, "--owner=archbp-110-spec"]));
    expect(held.held).toBe(true);
    await expect(
      execFileAsync("bun", [observer, "gate-check", ...args, "--json"], { timeout: 30000 }),
    ).rejects.toMatchObject({ code: 1 });
    // Release restores the open gate.
    const released = JSON.parse(run(["release", ...args]));
    expect(released.restored).toBe(true);
    const after = JSON.parse(run(["gate-check", ...args, "--json"]));
    expect(after.decision).toBe("allow");
    // The gate verdict carries the live-session context it protects.
    expect(after.active_sessions).toBeGreaterThan(0);
  }, 60000);

  test("the hold goes through the T8 control plane with a durable audit trail", () => {
    const auditPath = `${scratch}/audit.jsonl`;
    expect(existsSync(auditPath)).toBe(true);
    const lines = readFileSync(auditPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const acquire = lines.find((l) => l.action === "acquire" && l.resource === "os-update-hold");
    const release = lines.find((l) => l.action === "release" && l.resource === "os-update-hold");
    expect(acquire.adapter).toBe("lease-dir");
    expect(acquire.owner).toBe("archbp-110-spec");
    expect(release.restored).toBe(true);
    // Source-level: the observer builds on the T8 plane, not a parallel one.
    const src = readFileSync(observer, "utf8");
    expect(src).toContain('from "./host-control-plane.mjs"');
  });

  test("the root handoff snippet is generated, never installed (ARCHBP-111 boundary)", () => {
    const out = run(["snippet"]);
    expect(out).toContain("DPkg::Pre-Invoke");
    expect(out).toContain("os-update-observer.mjs gate-check");
    expect(out).toContain("ARCHBP-111"); // install-by-root handoff named
    expect(out).toContain("/etc/apt/apt.conf.d/"); // destination documented, not touched
  });
});
