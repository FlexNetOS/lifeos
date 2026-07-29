// ARCHBP-011/§3.3 — live owner commit-to-projection/event latency receipt.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const outputPath = resolve(root, "evidence/benchmarks/redb_owner_latency.json");
const command = "/home/flexnetos/.nix-profile/bin/rtk";
let output = "";
try {
  output = execFileSync(command, [
    "proxy", "cargo", "test", "--manifest-path", "src-tauri/Cargo.toml",
    "--test", "redb_owner_latency_live", "--", "--nocapture",
  ], { cwd: root, encoding: "utf8" });
} catch (error) {
  process.stderr.write(`${error.stdout ?? ""}${error.stderr ?? ""}`);
  process.exit(error.status ?? 1);
}
const line = output.split("\n").find((value) => value.startsWith("ARCHBP_REDB_LATENCY "));
if (!line) throw new Error("redb latency test emitted no receipt");
const receipt = JSON.parse(line.slice("ARCHBP_REDB_LATENCY ".length));
const result = {
  ...receipt,
  schemaVersion: "lifeos.redb-owner-latency.v1",
  recordedAt: new Date().toISOString(),
  repository: {
    root,
    sourceSha256: createHash("sha256").update(readFileSync(resolve(root, "src-tauri/tests/redb_owner_latency_live.rs"))).digest("hex"),
  },
  command: `${command} proxy cargo test --manifest-path src-tauri/Cargo.toml --test redb_owner_latency_live -- --nocapture`,
  productionBoundary: "OwnerClient -> OwnerService -> checksummed mmap ProjectionReader -> ordered UDS event receipt",
  renderLeg: "not included; Glass render latency remains a separate acceptance measurement",
};
mkdirSync(dirname(outputPath), { recursive: true });
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
