import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, afterAll } from "vitest";

// ARCHBP-116 — Encode update governance as declarative config, not manual
// steps. Gate: Policy declared in config; Guard enforces it; Reviewable in
// repo. (yzx-iso t9, G10.) The policy is a committed artifact; the ARCHBP-110
// guard CONSUMES it — changing the config changes the guard's behavior, with
// no code edit. Root application of holds/hooks stays ARCHBP-111/112.

const repoRoot = resolve(import.meta.dirname, "..");
const policyPath = resolve(repoRoot, "planning-spine-v0/docs/update_governance_policy.json");
const observer = resolve(repoRoot, "scripts/os-update-observer.mjs");
const scratch = `/home/flexnetos/meta/var/tmp/archbp-116-${process.pid}`;
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const policy = () => JSON.parse(readFileSync(policyPath, "utf8"));

describe("ARCHBP-116 declarative update governance", () => {
  test("the policy is declared in config with holds, gate, and reboot intent", () => {
    expect(existsSync(policyPath)).toBe(true);
    const p = policy();
    expect(p.schema_version).toBe("lifeos-planning-spine.update-governance-policy.v0");
    const held = p.holds.map((h: { pattern: string }) => h.pattern).join(" ");
    expect(held).toContain("linux-image");
    expect(held).toContain("snapd");
    expect(held).toContain("accountsservice");
    for (const h of p.holds) {
      expect(h.during, h.pattern).toBe("active-session");
      expect(h.apply_mechanism, h.pattern).toContain("ARCHBP-111"); // root handoff named
    }
    expect(p.gate.enabled).toBe(true);
    expect(p.gate.mechanism).toContain("os-update-hold");
    expect(p.reboot.auto_reboot).toBe("forbidden");
    expect(p.reboot.requires).toContain("ARCHBP-112");
  });

  test("the guard enforces the declared policy — config change flips behavior, no code edit", async () => {
    mkdirSync(scratch, { recursive: true });
    const run = (args: string[]) => {
      try {
        return { out: execFileSync("bun", [observer, ...args], { encoding: "utf8", timeout: 30000 }), code: 0 };
      } catch (e) {
        const err = e as { status: number; stdout: string };
        return { out: String(err.stdout ?? ""), code: err.status };
      }
    };
    // Take the hold, then check the gate under two DECLARED policies.
    execFileSync("bun", [observer, "hold", `--scratch=${scratch}`, "--owner=archbp-116-spec"], { timeout: 30000 });
    try {
      const enabled = `${scratch}/policy-on.json`;
      const disabled = `${scratch}/policy-off.json`;
      writeFileSync(enabled, JSON.stringify({ ...policy(), gate: { ...policy().gate, enabled: true } }));
      writeFileSync(disabled, JSON.stringify({ ...policy(), gate: { ...policy().gate, enabled: false } }));
      const blocked = run(["gate-check", `--scratch=${scratch}`, `--policy=${enabled}`, "--json"]);
      expect(blocked.code).toBe(1); // policy on + hold live -> block
      expect(JSON.parse(blocked.out.trim()).decision).toBe("block");
      const open = run(["gate-check", `--scratch=${scratch}`, `--policy=${disabled}`, "--json"]);
      expect(open.code).toBe(0); // policy off, SAME hold -> allow: the config governs
      const v = JSON.parse(open.out.trim());
      expect(v.decision).toBe("allow");
      expect(v.policy_gate_enabled).toBe(false); // the verdict cites the declared policy
    } finally {
      execFileSync("bun", [observer, "release", `--scratch=${scratch}`], { timeout: 30000 });
    }
  }, 90000);

  test("the policy is reviewable in-repo and consistent with the 109 lifecycle map", () => {
    const p = policy();
    // Every held class traces to a desktop-breaking pattern in the 109 map —
    // the policy cites its evidence rather than inventing classes.
    const map = JSON.parse(readFileSync(
      resolve(repoRoot, "planning-spine-v0/docs/os_update_lifecycle_map.json"), "utf8"));
    const mapPatterns = map.desktop_breaking_packages.map((d: { pattern: string }) => d.pattern).join(" ");
    for (const h of p.holds) {
      expect(mapPatterns, h.pattern).toContain(h.pattern.split("*")[0].replace(/-$/, ""));
      expect(h.evidence, h.pattern).toContain("os_update_lifecycle_map");
    }
    // The guard's default policy source IS this committed file.
    const src = readFileSync(observer, "utf8");
    expect(src).toContain("update_governance_policy.json");
  });
});
