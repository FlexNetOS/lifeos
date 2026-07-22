import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-129 — GAP t2-1-envelope-design: Define private /, /nix, home
// overlay, and durable-state mounts the sandbox presents.

const repoRoot = resolve(import.meta.dirname, "..");
const designPath = resolve(repoRoot, "planning-spine-v0/docs/envelope_mount_design.json");
const design = () => JSON.parse(readFileSync(designPath, "utf8"));

describe("ARCHBP-129 envelope mount design", () => {
  test("the mount table is fully specified", () => {
    expect(existsSync(designPath)).toBe(true);
    const d = design();
    const paths = d.mount_table.map((m: { path: string }) => m.path).join("\n");
    // The four headline surfaces of the design brief.
    expect(paths).toContain("/");
    expect(paths).toContain("/nix");
    expect(paths).toContain("$HOME");
    expect(paths).toContain("/durable/");
    for (const m of d.mount_table) {
      expect(["tmpfs", "ro-bind", "bind", "dev-bind", "proc", "dev"]).toContain(m.mechanism);
      expect(typeof m.rationale).toBe("string");
      expect(m.rationale.length).toBeGreaterThan(30);
    }
  });

  test("overlay-vs-bind decisions are recorded with rationale", () => {
    const d = design();
    const decisions = d.mount_table.map((m: { decision: string }) => m.decision);
    expect(decisions).toContain("tmpfs-not-overlay");
    expect(decisions).toContain("overlay-as-tmpfs-not-overlayfs");
    expect(decisions).toContain("bind-not-copy");
    expect(decisions).toContain("explicit-rw-bind-per-durable-root");
  });

  test("the design matches the T1.2 tier map and the implemented engine", () => {
    const d = design();
    expect(d.tier_map).toContain("isolation_tier_map.json");
    const map = JSON.parse(
      readFileSync(resolve(repoRoot, "planning-spine-v0/docs/isolation_tier_map.json"), "utf8"),
    );
    // Every mount-table tier value is a tier the map defines.
    for (const m of d.mount_table) {
      expect(Object.keys(map.tiers)).toContain(m.tier);
    }
    // The durable mount row names the map's durable roots.
    const durableRow = d.mount_table.find((m: { tier: string; mechanism: string }) => m.tier === "durable");
    expect(durableRow.rationale).toContain("meta/var/lib/postgresql");
    // The design is implemented: the engine constructs exactly these
    // primitives (tmpfs root, ro /nix, tmpfs HOME, explicit binds).
    const engine = [
      "/home/flexnetos/meta/src/yazelix/envelope/yzx-envelope.sh",
      "/home/flexnetos/meta/src/yazelix/.claude/worktrees/archbp-065-envelope/envelope/yzx-envelope.sh",
    ].find((p) => existsSync(p));
    expect(engine).toBeTruthy();
    const src = readFileSync(engine as string, "utf8");
    expect(src).toContain("--tmpfs /");
    // Since ARCHBP-021 the store bind is parameterized (--store mode binds an
    // extracted release closure at /nix); the default remains the host store.
    expect(src).toContain('--ro-bind "$STORE_SRC" /nix');
    expect(src).toContain('STORE_SRC="/nix"');
    expect(src).toContain('--tmpfs "$HOME"');
  });
});
