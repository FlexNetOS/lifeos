import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, test } from "vitest";

// ARCHBP-099 — Automated harness that cold-reboots and asserts full re-attach.
// Gate: Harness built; Runs unattended; Asserts service + session restore.
// (yzx-iso t7-8, G7.) The harness's arm/verify phases and every assertion are
// proven here in-session; executing the physical reboot is ARCHBP-100.

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");
const harness = resolve(repoRoot, "scripts/cold-reboot-harness.mjs");
// Fixtures live on the DURABLE tier: the harness (correctly) refuses /run
// tmpfs roots for both its state and the session store.
const scratch = `/home/flexnetos/meta/var/tmp/archbp-099-${process.pid}`;
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const bootId = () =>
  readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();

// Fixture session store: one project with one durable transcript.
function makeSessionRoot(dir: string) {
  mkdirSync(`${dir}/project-a`, { recursive: true });
  writeFileSync(`${dir}/project-a/t1.jsonl`, "{}\n");
  return dir;
}

// Fixture services in the boot-reattach schema, TCP-health-gated on ports
// unique to this run (pid-derived, same discipline as the 096 spec).
const p1 = 23700 + (process.pid % 97);
function fixtureServices(port: number) {
  return [
    {
      name: "fixture-db",
      order: 1,
      healthTcp: port,
      timeoutMs: 20000,
      start: ["bun", "-e", `Bun.listen({hostname:'127.0.0.1',port:${port},socket:{data(){}}}); setTimeout(()=>{}, 8000)`],
    },
    { name: "fixture-plane", order: 2, health: ["test", "-d", "/"], timeoutMs: 5000 },
  ];
}

function armed(name: string, services: unknown) {
  const dir = `${scratch}/${name}`;
  mkdirSync(dir, { recursive: true });
  const servicesPath = `${dir}/services.json`;
  writeFileSync(servicesPath, JSON.stringify(services));
  const sessionRoot = makeSessionRoot(`${dir}/sessions`);
  const statePath = `${dir}/expectation.json`;
  execFileSync("bun", [harness, "arm", `--services=${servicesPath}`, `--session-root=${sessionRoot}`, `--state=${statePath}`], { timeout: 30000 });
  return { dir, servicesPath, sessionRoot, statePath };
}

describe("ARCHBP-099 cold-reboot re-attach harness", () => {
  test("harness built: arm captures a durable expectation manifest", () => {
    expect(existsSync(harness)).toBe(true);
    const { statePath } = armed("arm", fixtureServices(p1));
    const m = JSON.parse(readFileSync(statePath, "utf8"));
    expect(m.schema_version).toBe("lifeos-planning-spine.cold-reboot-expectation.v0");
    expect(m.boot_id).toBe(bootId()); // armed on THIS boot — verify demands the next one
    expect(m.services.map((s: { name: string }) => s.name)).toEqual(["fixture-db", "fixture-plane"]);
    expect(m.sessions.count).toBe(1); // the fixture transcript is the baseline
    expect(m.sessions.root).not.toMatch(/^\/run\//); // durable store, never tmpfs
  });

  test("verify runs unattended and asserts service + session restore", async () => {
    const { statePath, dir } = armed("green", fixtureServices(p1 + 1));
    const receiptPath = `${dir}/verdict.json`;
    // Unattended: no TTY, stdin ignored — exactly how the post-boot unit runs it.
    const { stdout } = await execFileAsync(
      "bun", [harness, "verify", `--state=${statePath}`, `--output=${receiptPath}`, "--allow-same-boot"],
      { timeout: 90000 },
    );
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos-planning-spine.cold-reboot-verdict.v0");
    expect(receipt.ok, stdout).toBe(true);
    expect(receipt.cold_reboot).toBe(false); // honest: this run was same-boot
    expect(receipt.services.healthy).toBe(2);
    expect(receipt.sessions.restored).toBe(true);
    expect(receipt.sessions.found).toBeGreaterThanOrEqual(receipt.sessions.expected);
    expect(JSON.parse(stdout.trim()).ok).toBe(true); // verdict also on stdout for the unit journal
  }, 120000);

  test("verify fails loudly when a service did not come back", async () => {
    const dead = [{ name: "gone-db", order: 1, healthTcp: 23699, timeoutMs: 500 }];
    const { statePath, dir } = armed("dead", dead);
    const receiptPath = `${dir}/verdict.json`;
    await expect(
      execFileAsync("bun", [harness, "verify", `--state=${statePath}`, `--output=${receiptPath}`, "--allow-same-boot"], { timeout: 90000 }),
    ).rejects.toMatchObject({ code: 1 });
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.ok).toBe(false);
    expect(receipt.services.failed).toBe("gone-db"); // named, never swallowed
  }, 120000);

  test("verify refuses a same-boot run unless explicitly allowed", async () => {
    const { statePath, dir } = armed("sameboot", fixtureServices(p1 + 2));
    const receiptPath = `${dir}/verdict.json`;
    // The gauntlet contract: without the override the harness demands that a
    // real cold reboot happened since arm — same boot_id is an early failure.
    await expect(
      execFileAsync("bun", [harness, "verify", `--state=${statePath}`, `--output=${receiptPath}`], { timeout: 30000 }),
    ).rejects.toMatchObject({ code: 1 });
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.verdict).toBe("same-boot");
    expect(receipt.cold_reboot).toBe(false);
  }, 60000);

  test("the unit runs verify non-interactively at login with no host-unit coupling", () => {
    const out = execFileSync("bun", [harness, "unit"], { encoding: "utf8" });
    expect(out).toContain("Type=oneshot");
    expect(out).toContain("cold-reboot-harness.mjs verify");
    expect(out).toContain("WantedBy=default.target");
    expect(out).not.toMatch(/^Requires=/m); // host boots freely (G1)
    expect(out).not.toMatch(/StandardInput=tty|TTYPath/); // unattended
  });
});
