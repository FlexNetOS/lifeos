import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { BASH, engine, probeJson } from "./helpers/yzx-envelope";

// ARCHBP-069 — On-demand passthrough of GPU, ports, and devices into the
// envelope for big-brother control. (yzx-iso t2-6-resource-hooks, G8;
// integrates the t8 host-control lane: acquire on demand, release cleanly.)

describe("ARCHBP-069 on-demand resource passthrough", () => {
  test("GPU passthrough works on demand — and only on demand", () => {
    expect(existsSync("/dev/dri")).toBe(true);
    const withGpu = probeJson(["--id", "t069-gpu", "--gpu"]);
    expect(withGpu.gpu_dri).toBe("yes");
    expect(withGpu.gpu_nvidia).toBe("yes");
    // Without acquisition the GPU is absent — passthrough is never ambient.
    const withoutGpu = probeJson(["--id", "t069-nogpu"]);
    expect(withoutGpu.gpu_dri).toBe("no");
    expect(withoutGpu.gpu_nvidia).toBe("no");
  }, 60000);

  test("port/network acquire + release: shared net vs isolated net", () => {
    // Acquired: the envelope sees the host's interfaces (ports reachable).
    const acquired = probeJson(["--id", "t069-net"]);
    expect(Number(acquired.net_devices)).toBeGreaterThan(1);
    // Released: --isolate-net leaves only loopback — host ports are gone.
    const released = probeJson(["--id", "t069-iso", "--isolate-net"]);
    expect(Number(released.net_devices)).toBe(1);
  }, 60000);

  test("single-device passthrough and clean teardown", () => {
    const dev = "/dev/dri/renderD128";
    expect(existsSync(dev)).toBe(true);
    const r = engine([
      "enter", "--id", "t069-dev", "--device", dev,
      "--", BASH, "-c", `test -e ${dev} && echo device-visible; test -e /dev/dri/card1 || echo other-nodes-absent`,
    ]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("device-visible");
    expect(r.stdout).toContain("other-nodes-absent"); // only the requested node passed through
    const check = engine(["leakcheck", "t069-dev"]);
    expect(JSON.parse(check.stdout.trim()).clean).toBe(true);
  }, 60000);
});
