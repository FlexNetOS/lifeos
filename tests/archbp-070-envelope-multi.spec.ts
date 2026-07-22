import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, test } from "vitest";
import { BASH, engine, enginePath } from "./helpers/yzx-envelope";

// ARCHBP-070 — Multiple envelopes on one shared kernel without state
// collision. (yzx-iso t2-8-multi-session, G2.)

function enterAsync(args: string[]): Promise<{ status: number; stdout: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn("bash", [enginePath(), "enter", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.on("close", (status) => resolvePromise({ status: status ?? 1, stdout }));
  });
}

describe("ARCHBP-070 concurrent envelopes", () => {
  test("N envelopes coexist with no cross-session leakage and a safe shared durable plane", async () => {
    const shared = mkdtempSync(join(tmpdir(), "archbp070-"));
    try {
      // O_APPEND single-line writes are atomic on the shared durable plane.
      const script = (name: string) =>
        `echo ${name} > /tmp/${name}-private; sleep 0.5; ls /tmp; echo ${name} >> /durable/shared/log`;
      const [a, b, c] = await Promise.all([
        enterAsync(["--id", "t070-a", "--durable", `${shared}:/durable/shared`, "--", BASH, "-c", script("alpha")]),
        enterAsync(["--id", "t070-b", "--durable", `${shared}:/durable/shared`, "--", BASH, "-c", script("beta")]),
        enterAsync(["--id", "t070-c", "--durable", `${shared}:/durable/shared`, "--", BASH, "-c", script("gamma")]),
      ]);
      for (const r of [a, b, c]) expect(r.status).toBe(0);
      // Each envelope saw ONLY its own private /tmp file while all three ran.
      expect(a.stdout).toContain("alpha-private");
      expect(a.stdout).not.toContain("beta-private");
      expect(b.stdout).toContain("beta-private");
      expect(b.stdout).not.toContain("gamma-private");
      expect(c.stdout).toContain("gamma-private");
      expect(c.stdout).not.toContain("alpha-private");
      // The shared durable plane received exactly one line from each.
      const log = readFileSync(join(shared, "log"), "utf8").trim().split("\n").sort();
      expect(log).toEqual(["alpha", "beta", "gamma"]);
      // All three tore down clean.
      for (const id of ["t070-a", "t070-b", "t070-c"]) {
        expect(JSON.parse(engine(["leakcheck", id]).stdout.trim()).clean).toBe(true);
      }
    } finally {
      rmSync(shared, { recursive: true, force: true });
    }
  }, 120000);
});
