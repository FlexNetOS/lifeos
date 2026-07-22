// yzx-iso T9.2 (spine ARCHBP-110) — hook host update events so LifeOS can
// observe or gate them during active work.
//
// Observe (unprivileged, live):
//   events   normalized apt history stanzas, risk-classified against the
//            ARCHBP-109 lifecycle map's desktop-breaking patterns
//   timers   last/next fire of the apt-daily timer surface
// Gate (unprivileged lever + root handoff):
//   hold     take the os-update-hold lease through the T8 control plane —
//            the durable, audited "LifeOS is mid-work" signal
//   release  release the lease through the plane (audited, restore-verified)
//   gate-check  exit 1 (block) while the hold is live, 0 otherwise — the
//            command the generated DPkg::Pre-Invoke hook runs before apt acts
//   snippet  the apt.conf.d hook text; installing it under /etc is root and
//            stays with ARCHBP-111 (/etc mutation is a blocked path here).
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { HostControlPlane } from "./host-control-plane.mjs";
import { listSessions } from "./boot-reattach.mjs";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");
const MAP_PATH = resolve(repoRoot, "planning-spine-v0/docs/os_update_lifecycle_map.json");
// ARCHBP-116: governance is DECLARED, not hardcoded — the guard consumes the
// committed policy; changing governance means changing that reviewable file.
const POLICY_DEFAULT = resolve(repoRoot, "planning-spine-v0/docs/update_governance_policy.json");
const SCRATCH_DEFAULT = "/home/flexnetos/meta/var/xdg-data/lifeos/os-update-gate";
const HOLD_RESOURCE = "os-update-hold";

// --- observe ----------------------------------------------------------------
function packagesOf(line) {
  // "linux-image-7.0.0-28-generic:amd64 (7.0.0-28.28), foo:amd64 (1, 2)"
  return line.split("), ").map((chunk) => chunk.trim().split(":")[0].split(" ")[0]).filter(Boolean);
}

export function riskPatterns() {
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
  return map.desktop_breaking_packages.flatMap((p) =>
    p.pattern.split(",").map((g) => ({ pattern: g.trim(), why: p.why })));
}

export function classify(packages, patterns = riskPatterns()) {
  const matches = patterns.filter(({ pattern }) =>
    packages.some((pkg) => pattern.endsWith("*") ? pkg.startsWith(pattern.slice(0, -1)) : pkg === pattern));
  return { level: matches.length ? "desktop-breaking" : "routine", matches };
}

export function parseAptHistory(text, patterns = riskPatterns()) {
  const events = [];
  for (const stanza of text.split(/\n\n+/)) {
    if (!stanza.includes("Start-Date:")) continue;
    const field = (name) => stanza.match(new RegExp(`^${name}: (.*)$`, "m"))?.[1] ?? null;
    const actions = {};
    for (const kind of ["Install", "Upgrade", "Remove", "Purge"]) {
      const line = field(kind);
      if (line) actions[kind.toLowerCase()] = packagesOf(line);
    }
    const packages = Object.values(actions).flat();
    events.push({
      start: field("Start-Date"),
      end: field("End-Date"),
      commandline: field("Commandline"),
      actions,
      packages,
      risk: classify(packages, patterns),
    });
  }
  return events;
}

export function observeEvents(logPath = "/var/log/apt/history.log") {
  return parseAptHistory(readFileSync(logPath, "utf8"));
}

export function observeTimers(units = ["apt-daily.timer", "apt-daily-upgrade.timer"]) {
  const timers = units.map((unit) => {
    const out = execFileSync("systemctl", ["show", unit, "-p", "LastTriggerUSec", "-p", "NextElapseUSecRealtime"], { encoding: "utf8", timeout: 10000 });
    const value = (key) => {
      const v = out.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
      return v && v !== "n/a" ? v : null;
    };
    return { unit, last: value("LastTriggerUSec"), next: value("NextElapseUSecRealtime") };
  });
  return { timers };
}

// --- gate (T8 control plane) ------------------------------------------------
function plane(scratch, owner = "lifeos") {
  const registry = {
    schema_version: "lifeos-planning-spine.host-control-registry.v0",
    resources: [
      { name: HOLD_RESOURCE, adapter: "lease-dir", params: { path: `${scratch}/${HOLD_RESOURCE}.lease`, owner }, class: "daemons" },
    ],
  };
  return new HostControlPlane({ auditPath: `${scratch}/audit.jsonl`, registry });
}

export async function hold({ scratch = SCRATCH_DEFAULT, owner = "lifeos", ttlMs = 4 * 3600 * 1000 } = {}) {
  const p = plane(scratch, owner);
  await p.acquire(HOLD_RESOURCE, { ttlMs, owner });
  // The process exits but the lease dir persists — the durable cross-process
  // signal gate-check and the apt hook consult.
  return { held: true, lease: `${scratch}/${HOLD_RESOURCE}.lease`, owner, ttl_ms: ttlMs };
}

export async function release({ scratch = SCRATCH_DEFAULT, owner = "lifeos" } = {}) {
  const p = plane(scratch, owner);
  // Rebuild the hold record for the durable lease taken by an earlier process,
  // then release THROUGH the plane so the audit + restore verification apply.
  p.holds.set(HOLD_RESOURCE, {
    handle: { path: `${scratch}/${HOLD_RESOURCE}.lease` },
    prior: { path: `${scratch}/${HOLD_RESOURCE}.lease`, exists: false },
    expiresAt: 0,
    owner,
  });
  return p.release(HOLD_RESOURCE);
}

export function gateCheck({ scratch = SCRATCH_DEFAULT, policyPath = POLICY_DEFAULT } = {}) {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const lease = `${scratch}/${HOLD_RESOURCE}.lease`;
  const heldNow = existsSync(lease);
  const sessions = listSessions();
  // The declared policy governs: a live hold blocks only while the config
  // says the gate is enabled — behavior flips by config, never by code edit.
  const block = heldNow && policy.gate.enabled === true;
  return {
    schema_version: "lifeos-planning-spine.os-update-gate-verdict.v0",
    decision: block ? "block" : "allow",
    hold: heldNow,
    policy_source: policyPath,
    policy_gate_enabled: policy.gate.enabled === true,
    owner: heldNow ? readFileSync(`${lease}/owner`, "utf8").trim() : null,
    active_sessions: sessions.sessions.length,
    lease,
  };
}

const SNIPPET = `// 20lifeos-update-gate — generated by scripts/os-update-observer.mjs.
// ROOT HANDOFF (ARCHBP-111): install by copying this file to
// /etc/apt/apt.conf.d/20lifeos-update-gate — this repo never mutates /etc.
// While LifeOS holds os-update-hold, every apt/dpkg run (including
// unattended-upgrades) fails closed before touching packages.
DPkg::Pre-Invoke {
  "/home/flexnetos/.nix-profile/toolbin/bun ${repoRoot}/scripts/os-update-observer.mjs gate-check --scratch=${SCRATCH_DEFAULT} --json";
};
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const json = args.includes("--json");
  const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const scratch = opt("scratch", SCRATCH_DEFAULT);
  if (cmd === "events") {
    process.stdout.write(`${JSON.stringify(observeEvents(opt("log", "/var/log/apt/history.log")), null, json ? 0 : 2)}\n`);
  } else if (cmd === "timers") {
    process.stdout.write(`${JSON.stringify(observeTimers(), null, json ? 0 : 2)}\n`);
  } else if (cmd === "hold") {
    process.stdout.write(`${JSON.stringify(await hold({ scratch, owner: opt("owner", "lifeos"), ttlMs: Number(opt("ttl", 4 * 3600 * 1000)) }))}\n`);
  } else if (cmd === "release") {
    process.stdout.write(`${JSON.stringify(await release({ scratch, owner: opt("owner", "lifeos") }))}\n`);
  } else if (cmd === "gate-check") {
    const verdict = gateCheck({ scratch, policyPath: opt("policy", POLICY_DEFAULT) });
    process.stdout.write(`${JSON.stringify(verdict)}\n`);
    process.exit(verdict.decision === "block" ? 1 : 0);
  } else if (cmd === "snippet") {
    process.stdout.write(SNIPPET);
  } else {
    console.error("usage: os-update-observer.mjs {events|timers|hold|release|gate-check|snippet}");
    process.exit(2);
  }
}

if (import.meta.main) main();
