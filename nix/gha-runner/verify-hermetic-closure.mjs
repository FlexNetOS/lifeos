#!/usr/bin/env node
// Verify a Nix store path is a hermetic closure: every runtime dependency lives under
// /nix/store (zero OS deps), and the expected toolchain is present. Runs OUTSIDE the
// nix sandbox (needs `nix-store -qR`), so it is an R-gate instrument, not a flake check.
//
//   node verify-hermetic-closure.mjs [storePath]
//     - storePath defaults to `nix build .#gha-runner-substrate --print-out-paths`
//   exit 0 = hermetic + toolchain present; exit 1 = leak or missing tool.
import { execFileSync } from "node:child_process";

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

const REQUIRED = ["github-runner", "nodejs", "bun", "git", "nss-cacert"];

let target = process.argv[2];
try {
  if (!target) {
    target = sh("nix", ["build", ".#gha-runner-substrate", "--no-link", "--print-out-paths"]).split("\n").pop();
  }
} catch (e) {
  console.error("FAIL: could not build/resolve substrate:", e.message);
  process.exit(1);
}
console.log(`closure root: ${target}`);

let closure;
try {
  closure = sh("nix-store", ["-qR", target]).split("\n").filter(Boolean);
} catch (e) {
  console.error("FAIL: nix-store -qR error:", e.message);
  process.exit(1);
}

// 1. Zero OS deps: every closure path must be under /nix/store.
const leaks = closure.filter((p) => !p.startsWith("/nix/store/"));
if (leaks.length) {
  console.error(`FAIL: ${leaks.length} non-/nix/store path(s) — OS dep leak:`);
  leaks.slice(0, 10).forEach((p) => console.error("  " + p));
  process.exit(1);
}
console.log(`OK: ${closure.length} closure paths, all under /nix/store (zero OS deps)`);

// 2. Toolchain present.
const missing = REQUIRED.filter((tool) => !closure.some((p) => p.includes(tool)));
if (missing.length) {
  console.error(`FAIL: toolchain missing from closure: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`OK: toolchain present (${REQUIRED.join(", ")})`);
console.log("HERMETIC: PASS");
process.exit(0);
