// ARCHBP-001/002 — verify the mounted Glass readiness receipt from the
// authenticated redb owner's checksummed projection.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const redbRoot = resolve(process.env.LIFEOS_REDB_ROOT ?? "/home/flexnetos/meta/var/lib/redb");
const outputPath = resolve(process.env.LIFEOS_GLASS_RECEIPT ?? join(root, "evidence/glass/live-readiness-receipt.json"));
const pointerPath = join(redbRoot, "projection.pointer");

if (!existsSync(pointerPath)) throw new Error(`redb projection pointer is missing: ${pointerPath}`);
const pointer = JSON.parse(readFileSync(pointerPath, "utf8"));
const slotPath = join(redbRoot, `projection.${pointer.slot}.slot`);
const body = readFileSync(slotPath);
const checksum = createHash("sha256").update(body).digest("hex");
if (checksum !== pointer.checksum) throw new Error(`projection checksum mismatch: ${slotPath}`);

const rows = body.toString("utf8").trim().split("\n").slice(1).filter(Boolean).map((line) => JSON.parse(line));
const entries = Object.fromEntries(rows.map((row) => [row.k, row.v]));
const readiness = JSON.parse(entries["glass.ui.ready"] ?? "null");
const ageMs = readiness ? Date.now() - Number(readiness.mountedAt) : Number.POSITIVE_INFINITY;
const result = {
  schema_version: "lifeos.evidence.glass-ui-live.v1",
  authority: "authenticated redb owner projection",
  observed_at: new Date().toISOString(),
  projection: {
    slot: pointer.slot,
    local_seq: pointer.local_seq,
    checksum,
    checksum_verified: true,
    entry_count: rows.length,
  },
  readiness,
  age_ms: ageMs,
  fresh: Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 60_000,
};
if (!result.readiness || result.readiness.schemaVersion !== "lifeos.glass-ui-ready.v1" || result.readiness.state !== "ready" || result.readiness.identity !== "lifeos-glass" || !result.fresh) {
  throw new Error(JSON.stringify({ status: "not-ready", result }));
}
mkdirSync(join(root, "evidence/glass"), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: outputPath, local_seq: pointer.local_seq, age_ms: ageMs }, null, 2));
