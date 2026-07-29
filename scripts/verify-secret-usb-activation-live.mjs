import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const output = execFileSync(
  rtk,
  ["proxy", "/home/flexnetos/.nix-profile/bin/secretctl", "--json", "status"],
  { cwd: root, encoding: "utf8" },
);
const status = JSON.parse(output.trim());
const receipt = {
  schema_version: "lifeos.evidence.secret-usb-activation-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  daemon: "env-ctl.service",
  factor: "Cognitum Seed-backed USB",
  status,
  verdict:
    status.unlocked === true && status.usb_possessed === true
      ? "secret-usb-activation-live-pass"
      : "secret-usb-activation-live-fail",
};
const receiptPath = join(root, "evidence/secrets/usb-activation-live-receipt.json");
mkdirSync(join(root, "evidence/secrets"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
if (receipt.verdict !== "secret-usb-activation-live-pass") {
  throw new Error(`USB activation gate failed: ${JSON.stringify(status)}`);
}
console.log(JSON.stringify({ receipt: receiptPath, verdict: receipt.verdict }, null, 2));
