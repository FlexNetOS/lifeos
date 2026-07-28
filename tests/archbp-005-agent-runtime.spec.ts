import { mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const runtimeScript = resolve(repoRoot, "scripts/lifeos-agent-runtime.mjs");

function canConnect(root: string) {
  return new Promise<boolean>((resolveConnection) => {
    const socket = createConnection({ path: join(root, "owner.sock") });
    const finish = (available: boolean) => {
      socket.destroy();
      resolveConnection(available);
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function activeOwnerRoot() {
  const roots = [
    process.env.LIFEOS_REDB_ROOT,
    "/home/flexnetos/meta/var/lib/redb",
    "/run/user/1001/bpredb",
  ].filter((root): root is string => Boolean(root));
  for (const root of [...new Set(roots)]) {
    if (await canConnect(root)) return root;
  }
  return null;
}

function firstLine(child: ReturnType<typeof spawn>) {
  return new Promise<string>((resolveLine, reject) => {
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const line = output.split("\n")[0];
      if (line) {
        child.stdout?.off("data", onData);
        resolveLine(line);
      }
    };
    child.stdout?.on("data", onData);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!output) reject(new Error(`agent runtime exited before readiness: ${code}`));
    });
  });
}

describe("ARCHBP-005 supervised LifeOS agent runtime", () => {
  test("starts native RuvLLM + per-agent RVF and publishes readiness", async ({ skip }) => {
    const ownerRoot = await activeOwnerRoot();
    if (!ownerRoot) skip("no reachable redb owner socket");
    const rvfRoot = mkdtempSync(join(tmpdir(), "lifeos-agent-runtime-"));
    const child = spawn("/home/flexnetos/.nix-profile/bin/bun", [runtimeScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LIFEOS_REDB_ROOT: ownerRoot,
        LIFEOS_AGENT_RVF_ROOT: rvfRoot,
        LIFEOS_AGENT_HEARTBEAT_MS: "1000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const result = JSON.parse(await firstLine(child));
      expect(result.schemaVersion).toBe("lifeos.agent-runtime.v1");
      expect(result.status).toBe("ready");
      expect(result.agentId).toBe("lifeos-coordinator");
      expect(result.engine).toMatch(/^ruvllm-/);
      expect(result.identity.fileId).toMatch(/^[0-9a-f]+$/);
    } finally {
      child.kill("SIGTERM");
      await new Promise((resolveExit) => child.once("exit", resolveExit));
      rmSync(rvfRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
