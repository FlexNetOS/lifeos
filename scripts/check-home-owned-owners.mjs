// ARCHBP-082 — CI guard that fails on any home-owned active owner.
// Scans the known residual roots against the committed baseline:
//   default: FAIL on any NEW residual (a regression), while reporting the
//            known restart-gated residuals honestly.
//   --strict: FAIL on any residual at all (the post-T5 mode).
// Usage: bun scripts/check-home-owned-owners.mjs [--strict] [--baseline PATH]
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const bArg = args.indexOf("--baseline");
const baselinePath =
  bArg >= 0
    ? resolve(process.cwd(), args[bArg + 1])
    : resolve(repoRoot, "planning-spine-v0/docs/home_residual_baseline.json");

const HOME = "/home/flexnetos";
// The residual surface under path law: home-owned dirs that may act as
// active owners. Kept in sync with the T1 failure-mode catalog (FM-04).
const SCAN_ROOTS = [
  `${HOME}/.claude`,
  `${HOME}/.codex`,
  `${HOME}/.local/share/icm`,
  `${HOME}/.local/share/rtk`,
  `${HOME}/.local/share/yazelix`,
  `${HOME}/.local/share/weave`,
  `${HOME}/.local/share/env-ctl`,
  `${HOME}/.local/state/env-ctl`,
  `${HOME}/FlexNetOS`,
];

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const known = new Set(baseline.known_residuals.map((r) => r.path));

const present = SCAN_ROOTS.filter((p) => existsSync(p));
const newResiduals = present.filter((p) => !known.has(p));
const knownPresent = present.filter((p) => known.has(p));

for (const p of newResiduals) console.error(`NEW RESIDUAL: ${p} (not in baseline — regression)`);
for (const p of knownPresent) console.error(`known residual (restart/owner-gated retirement): ${p}`);

const failed = newResiduals.length > 0 || (strict && present.length > 0);
console.log(
  `home-owned-owner guard: ${SCAN_ROOTS.length} roots scanned, ${present.length} present, ${newResiduals.length} new${strict ? " (strict)" : ""} -> ${failed ? "FAIL" : "PASS"}`,
);
process.exit(failed ? 1 : 0);
