// ARCHBP-040 / §17 — capture the production Tauri binary and installer bundles.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const targetDir = process.env.CARGO_TARGET_DIR ?? "/home/flexnetos/meta/var/cargo-target";
const binary = resolve(targetDir, "release/lifeos");
const run = (args) => execFileSync(rtk, ["proxy", ...args], { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });

run(["bun", "run", "tauri:build"]);
const bytes = statSync(binary).size;
const sha256 = createHash("sha256").update(Buffer.from(await Bun.file(binary).arrayBuffer())).digest("hex");
const bundlePaths = {
  deb: resolve(targetDir, "release/bundle/deb/LifeOS_0.1.0_amd64.deb"),
  rpm: resolve(targetDir, "release/bundle/rpm/LifeOS-0.1.0-1.x86_64.rpm"),
};
const bundles = {};
for (const [kind, path] of Object.entries(bundlePaths)) {
  const data = Bun.file(path);
  const bytes = statSync(path).size;
  bundles[kind] = { path, bytes, sha256: createHash("sha256").update(Buffer.from(await data.arrayBuffer())).digest("hex") };
}
const receipt = {
  schema_version: "lifeos.evidence.tauri-native-build-live.v2",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  command: "bun run tauri:build",
  binary,
  bytes,
  sha256,
  bundles,
  verdict: "tauri-native-build-live-pass-deb-rpm-appimage-pending",
};
const output = resolve(root, "evidence/release/tauri-native-build-live-receipt.json");
mkdirSync(resolve(root, "evidence/release"), { recursive: true });
await Bun.write(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: output, verdict: receipt.verdict, bytes, sha256 }, null, 2));
