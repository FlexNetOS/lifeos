// ARCHBP-040 / §17 — capture the production Tauri Rust binary even when the
// host's Tauri CLI bundler cannot enter its installer phase.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const targetDir = process.env.CARGO_TARGET_DIR ?? "/home/flexnetos/meta/var/cargo-target";
const binary = resolve(targetDir, "release/lifeos");
const run = (args) => execFileSync(rtk, ["proxy", ...args], { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });

run(["cargo", "build", "--release", "--manifest-path", "src-tauri/Cargo.toml", "--no-default-features"]);
const bytes = statSync(binary).size;
const sha256 = createHash("sha256").update(Buffer.from(await Bun.file(binary).arrayBuffer())).digest("hex");
const receipt = {
  schema_version: "lifeos.evidence.tauri-native-build-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  command: "cargo build --release --manifest-path src-tauri/Cargo.toml --no-default-features",
  binary,
  bytes,
  sha256,
  installer_bundle: "not-produced: tauri-cli interface returns EMFILE before Cargo/bundler invocation on this host",
  verdict: "tauri-native-build-live-pass-installer-pending",
};
const output = resolve(root, "evidence/release/tauri-native-build-live-receipt.json");
mkdirSync(resolve(root, "evidence/release"), { recursive: true });
await Bun.write(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: output, verdict: receipt.verdict, bytes, sha256 }, null, 2));
