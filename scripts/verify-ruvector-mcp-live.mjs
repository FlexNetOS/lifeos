import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const binary = process.env.LIFEOS_RUVECTOR_MCP_BIN ?? "/home/flexnetos/meta/var/cargo-target/release/ruvector-mcp";
const cwd = process.env.LIFEOS_RUVECTOR_MCP_CWD ?? "/home/flexnetos/meta/var/lib/ruvector/runtime";
const db = process.env.LIFEOS_RUVECTOR_MCP_DB ?? "ruvector.db";
const source = process.env.LIFEOS_RUVECTOR_MCP_SOURCE ?? "/home/flexnetos/meta/src/meta-ruvector";
if (!existsSync(binary)) throw new Error(`RuVector MCP binary does not exist: ${binary}`);

const result = spawnSync(
  "cargo",
  ["run", "--quiet", "-p", "lifeos-core", "--example", "ruvector_mcp_live"],
  {
    cwd: root,
    env: {
      ...process.env,
      LIFEOS_RUVECTOR_MCP_BIN: binary,
      LIFEOS_RUVECTOR_MCP_CWD: cwd,
      LIFEOS_RUVECTOR_MCP_DB: db,
      LIFEOS_RUVECTOR_MCP_SOURCE: source,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`RuVector MCP live example exited ${result.status}`);

const payload = JSON.parse(result.stdout.trim());
const receipt = {
  schema_version: "lifeos.ruvector-mcp.live.v1",
  producer: "verify-ruvector-mcp-live",
  status: payload.status,
  binary,
  binary_sha256: createHash("sha256").update(readFileSync(binary)).digest("hex"),
  server_cwd: cwd,
  database: db,
  vector_db: payload.vector_db,
  gnn_cache: payload.gnn_cache,
  source_commit: execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
};
const output = resolve(root, "evidence/ruvector/ruvector-mcp-live-receipt.json");
writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: receipt.status, receipt: output }, null, 2));
