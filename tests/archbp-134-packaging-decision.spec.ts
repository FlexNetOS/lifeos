import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-134 — Decide the portable-release packaging strategy (static musl vs
// nix bundle vs relocatable closure). Gate: strategy chosen + justified;
// trade-offs recorded; prototype path identified. (yzx-iso t10-1, G6.)

const repoRoot = resolve(import.meta.dirname, "..");
const decisionPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/portable_release_packaging_decision.json",
);
const load = () => JSON.parse(readFileSync(decisionPath, "utf8"));

describe("ARCHBP-134 portable-release packaging decision", () => {
  test("a strategy is chosen and justified", () => {
    expect(existsSync(decisionPath)).toBe(true);
    const d = load();
    expect(d.schema_version).toBe(
      "lifeos-planning-spine.portable-release-packaging-decision.v0",
    );
    expect(d.strategy).toContain("static-musl");
    expect(d.strategy).toContain("relocatable");
    // The justification must be substantive, name the concrete toolchain, and
    // ground the split in this repo's proven envelope work.
    expect(d.justification.length).toBeGreaterThan(300);
    expect(d.justification).toContain("flexnetosMuslToolchain");
    expect(d.justification).toContain("yzx-envelope");
    expect(d.justification).toContain("PostgreSQL/RuVector");
  });

  test("trade-offs are recorded for every candidate mechanism", () => {
    const d = load();
    const names = d.options_considered.map((o: { option: string }) => o.option).join("\n");
    expect(names).toContain("nix bundle");
    expect(names).toContain("static-musl");
    expect(names).toContain("relocatable");
    expect(names).toContain("nix-user-chroot");
    expect(d.options_considered.length).toBeGreaterThanOrEqual(4);
    for (const o of d.options_considered) {
      expect(o.verdict, o.option).toBeTruthy();
      // Every option carries a real pro/con analysis, not a label.
      expect(o.trade_offs.length, o.option).toBeGreaterThan(80);
    }
    // The rejection of nix-user-chroot must cite the live AppArmor finding
    // (kernel.apparmor_restrict_unprivileged_userns) proven during ARCHBP-065.
    const nuc = d.options_considered.find(
      (o: { option: string }) => o.option === "nix-user-chroot",
    );
    expect(nuc.verdict).toBe("rejected");
    expect(nuc.trade_offs).toContain("userns");
  });

  test("a prototype path is identified and lands on ARCHBP-021", () => {
    const d = load();
    expect(d.prototype_path.task).toContain("ARCHBP-021");
    expect(d.prototype_path.steps.length).toBeGreaterThanOrEqual(5);
    const steps = d.prototype_path.steps.join("\n");
    // The path must cover: musl proof, classification, closure extraction,
    // envelope launcher, and a relocation test.
    expect(steps).toContain("musl");
    expect(steps.toLowerCase()).toContain("closure");
    expect(steps).toContain("yzx-envelope");
    expect(steps.toLowerCase()).toContain("relocation");
    // Store-independence invariants from the isolation ledger bind the path.
    expect(d.prototype_path.invariants).toContain("I09");
    expect(d.prototype_path.invariants).toContain("I17");
  });
});
