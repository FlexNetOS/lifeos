import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, createServer } from "node:net";
import { describe, expect, test } from "vitest";
// @ts-expect-error mjs module
import { HostControlPlane, defaultRegistry } from "../scripts/host-control-plane.mjs";

// ARCHBP-108 — Prove LifeOS commandeers and releases while the OS keeps
// functioning normally. (yzx-iso t8, G8; I11/I12/I13 end-to-end.)

function portFree(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = connect({ port, host: "127.0.0.1" });
    s.once("connect", () => { s.destroy(); res(false); });
    s.once("error", () => res(true));
  });
}

describe("ARCHBP-108 commandeer + clean release end-to-end", () => {
  test("commandeer demonstrated, clean release verified, OS normal throughout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp108-"));
    try {
      const auditPath = join(dir, "a.jsonl");
      const plane = new HostControlPlane({ auditPath, registry: defaultRegistry(dir, { port: 38488 }) });

      // COMMANDEER: LifeOS takes real authoritative control of the port —
      // while held, the little brother genuinely cannot bind it.
      expect(await portFree(38488)).toBe(true);
      await plane.acquire("loopback-port-38488", { ttlMs: 30000 });
      expect(await portFree(38488)).toBe(false); // LifeOS holds it for real
      const denied = createServer();
      const bindError = await new Promise<string>((res) => {
        denied.once("error", (e: NodeJS.ErrnoException) => res(e.code ?? "ERR"));
        denied.listen(38488, "127.0.0.1", () => res("BOUND"));
      });
      expect(bindError).toBe("EADDRINUSE"); // authoritative control is real

      // OS NORMAL THROUGHOUT: everything else keeps working during the hold.
      const other = createServer();
      await new Promise<void>((res, rej) => { other.once("error", rej); other.listen(38489, "127.0.0.1", () => res()); });
      await new Promise((res) => other.close(res));

      // CLEAN RELEASE: prior state restored and verified; the OS can take
      // the port back immediately.
      const { restored } = await plane.release("loopback-port-38488");
      expect(restored).toBe(true);
      expect(await portFree(38488)).toBe(true);

      // The full arc is audited: acquire (with prior) then release (restored).
      const lines = readFileSync(auditPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
      expect(lines.map((l) => l.action)).toEqual(["acquire", "release"]);
      expect(lines[1].restored).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
});
