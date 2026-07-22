import { describe, expect, test } from "vitest";
import { createServer } from "node:net";
// @ts-expect-error mjs module
import { startServicesOrdered } from "../scripts/boot-reattach.mjs";

// ARCHBP-096 — Start postgres, then redb, then the Glass/Engine front door
// in dependency order. (yzx-iso t7, G7.)

describe("ARCHBP-096 ordered health-gated startup", () => {
  test("ordered startup is implemented with health-gated transitions (real processes)", async () => {
    // Real fixture: two TCP services started by the engine itself, ordered.
    const services = [
      { name: "first", order: 1, healthTcp: 38561, timeoutMs: 8000, start: ["bun", "-e", "Bun.listen({hostname:'127.0.0.1',port:38561,socket:{data(){}}}); setTimeout(()=>{}, 20000)"] },
      { name: "second", order: 2, healthTcp: 38562, timeoutMs: 8000, start: ["bun", "-e", "Bun.listen({hostname:'127.0.0.1',port:38562,socket:{data(){}}}); setTimeout(()=>{}, 20000)"] },
    ];
    const r = await startServicesOrdered(services);
    expect(r.ok).toBe(true);
    expect(r.report.map((s: { name: string }) => s.name)).toEqual(["first", "second"]);
    expect(r.report.every((s: { healthy: boolean; started: boolean }) => s.healthy && s.started)).toBe(true);
  }, 30000);

  test("a failed dependency stops the chain and the failure is surfaced", async () => {
    const services = [
      { name: "broken-dep", order: 1, healthTcp: 38563, timeoutMs: 500 }, // nothing listens, no start
      { name: "never-reached", order: 2, health: ["true"] },
    ];
    const r = await startServicesOrdered(services);
    expect(r.ok).toBe(false);
    expect(r.failed).toBe("broken-dep"); // surfaced by name
    expect(r.report.length).toBe(1); // the dependent never started
  }, 15000);

  test("idempotency: an already-healthy service is not restarted", async () => {
    const server = createServer();
    await new Promise<void>((res, rej) => { server.once("error", rej); server.listen(38564, "127.0.0.1", () => res()); });
    try {
      const r = await startServicesOrdered([
        { name: "already-up", order: 1, healthTcp: 38564, start: ["false"] }, // start would fail if invoked
      ]);
      expect(r.ok).toBe(true);
      expect(r.report[0].started).toBe(false); // health passed first — no restart
    } finally {
      await new Promise((res) => server.close(res));
    }
  }, 15000);
});
