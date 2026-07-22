import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-063 — Enumerate what breaks isolation today: unattended-upgrades
// kernel swap, tmpfs profile-runtime, home residuals, host docker/kvm.
// (yzx-iso t1-7-failure-mode-catalog, G1.)

const repoRoot = resolve(import.meta.dirname, "..");
const catalogPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/isolation_failure_modes.json",
);

function loadCatalog() {
  return JSON.parse(readFileSync(catalogPath, "utf8"));
}

describe("ARCHBP-063 isolation failure-mode catalog", () => {
  test("the failure-mode catalog exists", () => {
    expect(existsSync(catalogPath)).toBe(true);
  });

  test("the four known breakage classes are cataloged", () => {
    const catalog = loadCatalog();
    const summaries = catalog.failure_modes
      .map((fm: { summary: string }) => fm.summary)
      .join("\n");
    expect(summaries).toMatch(/unattended-upgrades|kernel swap/i);
    expect(summaries).toMatch(/tmpfs.*profile-runtime|profile-runtime.*tmpfs/i);
    expect(summaries).toMatch(/home residual/i);
    expect(summaries).toMatch(/docker|kvm/i);
  });

  test("each failure mode has a root cause and an owning task", () => {
    const catalog = loadCatalog();
    expect(catalog.failure_modes.length).toBeGreaterThanOrEqual(4);
    for (const fm of catalog.failure_modes) {
      expect(fm.id, JSON.stringify(fm)).toMatch(/^FM-\d{2}$/);
      expect(typeof fm.root_cause).toBe("string");
      expect(fm.root_cause.length).toBeGreaterThan(10);
      expect(typeof fm.owning_task).toBe("string");
      // Owning tasks are spine tasks or yzx-iso lanes — never unassigned.
      expect(fm.owning_task).toMatch(/ARCHBP-\d{3}|tasks\/yzx-iso\//);
    }
  });

  test("the 2026-07-21 reboot incident is captured with its timeline", () => {
    const catalog = loadCatalog();
    const incident = catalog.incident_2026_07_21;
    expect(incident).toBeTruthy();
    expect(Array.isArray(incident.timeline)).toBe(true);
    expect(incident.timeline.length).toBeGreaterThanOrEqual(4);
    const flat = JSON.stringify(incident);
    // Kernel swap while the session was live, and the reboot itself.
    expect(flat).toContain("7.0.0-28");
    expect(flat).toMatch(/21:28/);
    // The honest facts: filesystem intact, processes lost.
    expect(flat).toMatch(/intact/i);
  });

  test("the catalog feeds T5, T6, and T9", () => {
    const catalog = loadCatalog();
    const feeds = new Set(
      catalog.failure_modes.flatMap((fm: { feeds: string[] }) => fm.feeds),
    );
    for (const lane of ["T5", "T6", "T9"]) {
      expect(feeds.has(lane), `no failure mode feeds ${lane}`).toBe(true);
    }
  });
});
