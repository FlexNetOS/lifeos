import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-109 — Map unattended-upgrades, apt, snap refresh, kernel installs
// and their triggers/timing. (yzx-iso t9, G10.)

const repoRoot = resolve(import.meta.dirname, "..");
const mapPath = resolve(repoRoot, "planning-spine-v0/docs/os_update_lifecycle_map.json");
const load = () => JSON.parse(readFileSync(mapPath, "utf8"));

describe("ARCHBP-109 OS-update lifecycle map", () => {
  test("mechanisms and schedules are documented, cross-checked against the live host", () => {
    expect(existsSync(mapPath)).toBe(true);
    const m = load();
    const names = m.mechanisms.map((x: { name: string }) => x.name).join("\n");
    expect(names).toContain("unattended-upgrades");
    expect(names).toContain("apt-daily");
    expect(names).toContain("snap refresh");
    expect(names).toContain("kernel install");
    for (const mech of m.mechanisms) {
      expect(mech.trigger, mech.name).toBeTruthy();
      expect(mech.schedule, mech.name).toBeTruthy();
      expect(mech.risk, mech.name).toBeTruthy();
    }
    // Live cross-check: the map's claim that both periodic flags are enabled
    // must match the real host config right now.
    const auto = readFileSync("/etc/apt/apt.conf.d/20auto-upgrades", "utf8");
    expect(auto).toContain('APT::Periodic::Update-Package-Lists "1"');
    expect(auto).toContain('APT::Periodic::Unattended-Upgrade "1"');
  });

  test("desktop-breaking packages are identified with reasons", () => {
    const m = load();
    const patterns = m.desktop_breaking_packages.map((p: { pattern: string }) => p.pattern).join(" ");
    expect(patterns).toContain("linux-image");
    expect(patterns).toContain("snapd");
    expect(patterns).toContain("accountsservice");
    for (const p of m.desktop_breaking_packages) {
      expect(p.why.length, p.pattern).toBeGreaterThan(20);
    }
  });

  test("the 2026-07-21 incident is referenced and tied to the observed timer", () => {
    const m = load();
    expect(m.incident_reference.catalog).toContain("isolation_failure_modes.json");
    // The causal tie: the timer's last run matches the kernel-swap minute.
    expect(JSON.stringify(m)).toContain("06:29:49");
    expect(JSON.stringify(m)).toContain("7.0.0-28");
    // Governance handoff lanes are named for T9's remaining tasks.
    expect(m.governance_targets.observe).toContain("ARCHBP-110");
    expect(m.governance_targets.hold_during_sessions).toContain("ARCHBP-111");
  });
});
