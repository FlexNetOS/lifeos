import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const psql = process.env.LIFEOS_PSQL ?? "/home/flexnetos/.nix-profile/bin/psql";
const defaultSocket = "/home/flexnetos/meta/var/run/postgresql";
const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  (existsSync(join(defaultSocket, ".s.PGSQL.5432"))
    ? `postgresql://${process.env.USER ?? "flexnetos"}@localhost/lifeos?host=${encodeURIComponent(defaultSocket)}`
    : null);
if (!databaseUrl) {
  throw new Error("LIFEOS_DATABASE_URL is required when the canonical PostgreSQL socket is unavailable");
}

const output = execFileSync(rtk, ["proxy", "bun", "scripts/verify-postgres-ruvector.mjs"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, LIFEOS_DATABASE_URL: databaseUrl, LIFEOS_PSQL: psql },
});
const verification = JSON.parse(output.trim());
if (verification.status !== "ok") {
  throw new Error("PostgreSQL/RuVector live verification did not return status=ok");
}

const parsed = new URL(databaseUrl);
const receipt = {
  schema_version: "lifeos.evidence.postgres-ruvector-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  authority_invariants: [1, 2, 7, 13, 18],
  connection: {
    database: parsed.pathname.replace(/^\//, "") || "lifeos",
    socket: parsed.searchParams.get("host") ?? parsed.hostname,
    user: parsed.username || process.env.USER || "unknown",
    password_recorded: false,
  },
  server_version: verification.server_version,
  search_path: verification.search_path,
  ruvector: verification.ruvector,
  migrations: verification.migrations,
  required_schemas: verification.required_schemas,
  verification_script: "scripts/verify-postgres-ruvector.mjs",
  verification_output_sha256: createHash("sha256").update(output).digest("hex"),
};

const receiptPath = join(root, "evidence/postgres-ruvector/live-authority-receipt.json");
mkdirSync(join(root, "evidence/postgres-ruvector"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: receiptPath, status: "ok", server: verification.server_version, migrations: verification.migrations.count }, null, 2));
