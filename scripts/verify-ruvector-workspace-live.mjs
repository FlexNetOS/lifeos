// ARCHBP-040 / §17 — check the complete pinned RuVector workspace with the
// native pkg-config closure required by fontconfig and libudev dependents.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const ruvectorRoot = "/home/flexnetos/meta/src/meta-ruvector";
const receiptPath = resolve("evidence/ruvector/workspace-live-receipt.json");
const pkgConfigDirs = [
  "/home/flexnetos/.nix-profile/lib/pkgconfig",
  "/run/current-system/sw/lib/pkgconfig",
  "/usr/lib/x86_64-linux-gnu/pkgconfig",
  "/usr/lib/pkgconfig",
].filter((dir) => existsSync(dir));
const requiredPcFiles = ["fontconfig.pc", "libudev.pc"];
const missingPcFiles = requiredPcFiles.filter((file) =>
  !pkgConfigDirs.some((dir) => existsSync(`${dir}/${file}`))
);
if (missingPcFiles.length) {
  throw new Error(`missing native pkg-config files: ${missingPcFiles.join(", ")}`);
}

function run(args, options = {}) {
  return execFileSync(rtk, ["proxy", ...args], {
    cwd: ruvectorRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

const commit = run(["git", "rev-parse", "HEAD"]).trim();
const metadata = JSON.parse(run(["cargo", "metadata", "--no-deps", "--format-version", "1"]));
const output = run(["cargo", "check", "--workspace"], {
  env: {
    ...process.env,
    PKG_CONFIG_PATH: [...pkgConfigDirs, process.env.PKG_CONFIG_PATH].filter(Boolean).join(":"),
  },
});
const blueprint = Bun.file(resolve(root, "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md"));
const blueprintBytes = await blueprint.arrayBuffer();
const receipt = {
  schema_version: "lifeos.evidence.ruvector-workspace-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  repository: ruvectorRoot,
  commit,
  package_count: metadata.packages.length,
  package_names: metadata.packages.map((pkg) => pkg.name).sort(),
  pkg_config_dirs: pkgConfigDirs,
  required_pc_files: requiredPcFiles,
  cargo_check: {
    command: "cargo check --workspace",
    status: "passed",
    output_sha256: createHash("sha256").update(output).digest("hex"),
    output_lines: output.split("\n").filter(Boolean).length,
  },
  blueprint_sha256: createHash("sha256").update(Buffer.from(blueprintBytes)).digest("hex"),
  verdict: "ruvector-workspace-live-pass",
};
mkdirSync(resolve(root, "evidence/ruvector"), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: receiptPath, verdict: receipt.verdict, commit, package_count: receipt.package_count }, null, 2));
