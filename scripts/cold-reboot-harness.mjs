// yzx-iso T7.8 (spine ARCHBP-099) — automated cold-reboot re-attach harness.
//
// Two phases around a real reboot:
//   arm     capture the expectation manifest on the CURRENT boot: boot_id,
//           the service set that must come back, and the durable session
//           baseline. Written to durable storage (never /run tmpfs).
//   verify  after the reboot: demand a NEW boot_id (unless --allow-same-boot,
//           the in-session test override), run the full boot re-attach, and
//           assert every expected service is healthy and every durable
//           session survived. Verdict receipt on disk + stdout; exit 0/1.
//   unit    print the systemd USER unit that runs verify at login.
//
// The harness itself never reboots the host — executing the physical reboot
// gauntlet is ARCHBP-100 (owner-gated). Runs unattended: all inputs come from
// files and /proc, nothing reads stdin.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { listSessions, productionServices, reattach } from "./boot-reattach.mjs";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");
const STATE_DEFAULT = "/home/flexnetos/meta/var/xdg-data/lifeos/cold-reboot/expectation.json";
const VERDICT_DEFAULT = "/home/flexnetos/meta/var/xdg-data/lifeos/cold-reboot/verdict.json";

const bootId = () => readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();

function opt(args, name, fallback) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function writeJson(path, body) {
  if (path.startsWith("/run/")) throw new Error("harness state must be durable, never /run tmpfs");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
}

export function arm({ services, sessionRoot, statePath = STATE_DEFAULT } = {}) {
  if (!services) services = productionServices();
  const sessions = listSessions(sessionRoot);
  const manifest = {
    schema_version: "lifeos-planning-spine.cold-reboot-expectation.v0",
    boot_id: bootId(),
    armed_at: new Date().toISOString(),
    services: services.map(({ name, order }) => ({ name, order })),
    service_specs: services,
    sessions: { root: sessions.root, count: sessions.sessions.length },
  };
  writeJson(statePath, manifest);
  return manifest;
}

export async function verify({ statePath = STATE_DEFAULT, outputPath = VERDICT_DEFAULT, allowSameBoot = false } = {}) {
  const manifest = JSON.parse(readFileSync(statePath, "utf8"));
  const now = bootId();
  const coldReboot = now !== manifest.boot_id;
  const base = {
    schema_version: "lifeos-planning-spine.cold-reboot-verdict.v0",
    boot_id_armed: manifest.boot_id,
    boot_id_now: now,
    cold_reboot: coldReboot,
    same_boot_allowed: allowSameBoot,
  };
  if (!coldReboot && !allowSameBoot) {
    // The gauntlet contract: verify only counts after a real reboot.
    const verdict = { ...base, ok: false, verdict: "same-boot" };
    writeJson(outputPath, verdict);
    return verdict;
  }
  const report = await reattach({ services: manifest.service_specs, sessionRoot: manifest.sessions.root });
  const healthy = report.services.report.filter((s) => s.healthy).length;
  const sessionsRestored = report.sessions.count >= manifest.sessions.count;
  const ok = report.ok && healthy === manifest.services.length && sessionsRestored;
  const verdict = {
    ...base,
    ok,
    verdict: ok ? (coldReboot ? "cold-reboot-reattach-proven" : "same-boot-dry-run-pass") : "restore-incomplete",
    services: {
      expected: manifest.services.length,
      healthy,
      failed: report.services.ok ? null : report.services.failed,
    },
    sessions: { expected: manifest.sessions.count, found: report.sessions.count, restored: sessionsRestored },
    reattach: report,
  };
  writeJson(outputPath, verdict);
  return verdict;
}

const UNIT = `# lifeos-cold-reboot-verify.service — systemd USER unit (yzx-iso T7.8).
# Post-reboot half of the cold-reboot gauntlet: after 'arm' and a real
# reboot, this asserts full re-attach at first login and records the verdict.
#   systemctl --user enable lifeos-cold-reboot-verify.service
[Unit]
Description=LifeOS cold-reboot re-attach verification (yzx-iso T7.8)
# No Requires= on any host system unit: the host boots freely (G1).
After=lifeos-reattach.service

[Service]
Type=oneshot
ExecStart=/home/flexnetos/.nix-profile/toolbin/bun ${repoRoot}/scripts/cold-reboot-harness.mjs verify
RemainAfterExit=yes

[Install]
WantedBy=default.target
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "arm") {
    const svcArg = opt(args, "services");
    const manifest = arm({
      services: svcArg ? JSON.parse(readFileSync(resolve(process.cwd(), svcArg), "utf8")) : undefined,
      sessionRoot: opt(args, "session-root"),
      statePath: opt(args, "state", STATE_DEFAULT),
    });
    process.stdout.write(`${JSON.stringify(manifest)}\n`);
  } else if (cmd === "verify") {
    const verdict = await verify({
      statePath: opt(args, "state", STATE_DEFAULT),
      outputPath: opt(args, "output", VERDICT_DEFAULT),
      allowSameBoot: args.includes("--allow-same-boot"),
    });
    process.stdout.write(`${JSON.stringify(verdict)}\n`);
    process.exit(verdict.ok ? 0 : 1);
  } else if (cmd === "unit") {
    process.stdout.write(UNIT);
  } else {
    console.error("usage: cold-reboot-harness.mjs {arm|verify|unit}");
    process.exit(2);
  }
}

if (import.meta.main) main();
