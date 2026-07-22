import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-021 — Prove full-stack Yazelix musl and portable-closure release.
// Gate: YZXCONV-021 proof current; eligible binaries are reproducible musl
// artifacts; every non-musl dependency has an explicit owner and fallback;
// the release launches from a moved clean prefix; remaining host-Nix
// dependence is visible and blocks stronger claims. (Executes the ARCHBP-134
// strategy: static musl + relocatable extracted closure via yzx-envelope.)

const repoRoot = resolve(import.meta.dirname, "..");
const receiptPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/portable_release_root_coverage.json",
);
const receipt = () => JSON.parse(readFileSync(receiptPath, "utf8"));
const BUNDLE = "/home/flexnetos/meta/var/cache/archbp021/bundle-moved";

const sha256 = (p: string) =>
  createHash("sha256").update(readFileSync(p)).digest("hex");

describe("ARCHBP-021 portable release (musl + relocatable closure)", () => {
  test("eligible binaries are reproducible musl artifacts — re-verified from disk", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const r = receipt();
    expect(r.schema_version).toBe("lifeos-planning-spine.portable-release-root-coverage.v0");
    expect(r.implements).toContain("YZXCONV-021");
    expect(r.musl_artifacts.length).toBe(3);
    for (const a of r.musl_artifacts) {
      expect(a.reproducible, a.name).toBe(true);
      expect(a.file_type, a.name).toContain("static-pie");
      const onDisk = `${BUNDLE}/bin/${a.name}`;
      expect(sha256(onDisk), a.name).toBe(a.sha256); // the shipped byte is the proven byte
      // Executes store-free on this host right now.
      execFileSync(onDisk, ["--help"], { timeout: 10000 });
    }
  });

  test("every non-musl dependency has an explicit owner and fallback", () => {
    const r = receipt();
    expect(r.non_musl_classification.length).toBeGreaterThanOrEqual(6);
    const names = r.non_musl_classification.map((d: { dependency: string }) => d.dependency).join("\n");
    expect(names).toContain("WebKitGTK");
    expect(names).toContain("PostgreSQL");
    expect(names).toContain("bwrap");
    expect(names).toContain("yzx-config");
    for (const d of r.non_musl_classification) {
      expect(d.owner, d.dependency).toBeTruthy();
      expect(d.fallback.length, d.dependency).toBeGreaterThan(20);
    }
  });

  test("the release launches from the moved clean prefix — live relocation re-run", () => {
    const r = receipt();
    expect(r.closure.paths).toBeGreaterThanOrEqual(15);
    expect(r.relocation.moved_prefix).toBe(BUNDLE);
    // Test A live: bundle bash from the moved prefix, host store hidden.
    const out = execFileSync(`${BUNDLE}/launcher`, [
      "enter", "--id", "archbp021-spec-reloc", "--store", `${BUNDLE}/nixroot`, "--",
      r.relocation.store_workload, "-c", "echo relocation-ok; ls /nix/store | wc -l",
    ], { encoding: "utf8", timeout: 60000 });
    expect(out).toContain("relocation-ok");
    const visible = Number(out.trim().split("\n").pop());
    expect(visible).toBe(r.closure.paths); // ONLY the bundle store is visible
    expect(visible).toBeLessThan(100); // host store (thousands of paths) hidden
    // Test B live: musl workload with an EMPTY /nix — store-free.
    const b = execFileSync(`${BUNDLE}/launcher`, [
      "enter", "--id", "archbp021-spec-muslfree", "--store", r.relocation.empty_store_root,
      "--durable", `${BUNDLE}/bin:/opt/bin`, "--", "/opt/bin/yzx-tutor", "--help",
    ], { encoding: "utf8", timeout: 60000 });
    expect(b.length).toBeGreaterThan(0);
  }, 120000);

  test("remaining host-Nix dependence is visible and blocks stronger claims", () => {
    const r = receipt();
    expect(r.host_nix_dependence.remaining.length).toBeGreaterThanOrEqual(2);
    expect(r.host_nix_dependence.blocks_stronger_claims).toBe(true);
    // No false no-store claim anywhere in the receipt.
    expect(JSON.stringify(r)).not.toMatch(/"store_free":\s*true[^}]*full.stack/i);
  });
});
