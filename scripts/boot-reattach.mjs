// ARCHBP-093..098 — boot re-attach of the isolation
// envelope, durable services, and resumable sessions, per the ratified
// isolation spec v1.0.0 (Survival = durable tier + re-attach, I10).
//
// Subcommands:
//   reattach [--services PATH] [--json]   full idempotent re-attach sequence
//   sessions [--root PATH] [--json]       list resumable sessions (durable only)
// Yazelix is the only runtime owner. This command invokes the profile-owned
// stack bootstrap and then verifies durable state and service readiness.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { connect } from "node:net";
import { resolve, dirname } from "node:path";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");

// Durable roots re-attached at boot — exactly the T1.2/T3/T4 durable tier.
const DURABLE_ROOTS = [
  { name: "meta-var-lib", path: "/home/flexnetos/meta/var/lib", need: "exists" },
  { name: "postgres-datadir", path: "/home/flexnetos/meta/var/lib/postgresql", need: "exists" },
  { name: "xdg-data", path: "/home/flexnetos/meta/var/xdg-data", need: "writable" },
];

const YAZELIX_STACK_BOOTSTRAP = process.env.YAZELIX_STACK_BOOTSTRAP
  ?? "/home/flexnetos/.nix-profile/bin/yazelix-stack-bootstrap";

export function productionServices() {
  return [
    { name: "sqld", order: 1, healthTcp: 8080 },
    { name: "postgresql-ruvector", order: 2, healthTcp: 5432 },
    { name: "icm-web", order: 3, healthTcp: 8420 },
    { name: "lifeos-mqtt", order: 4, healthTcp: 1883 },
    { name: "glass-engine-frontdoor", order: 5, health: ["test", "-x", "/home/flexnetos/.nix-profile/bin/yzx"] },
  ];
}

const ENGINE_CANDIDATES = [
  process.env.YZX_ENVELOPE_BIN,
  "/home/flexnetos/meta/src/yazelix/envelope/yzx-envelope.nu",
].filter(Boolean);

export function envelopeEngine() {
  return ENGINE_CANDIDATES.find((c) => existsSync(c)) ?? null;
}

// (1) Re-materialize the envelope: construct a live envelope and observe it.
export function rematerializeEnvelope() {
  const engine = envelopeEngine();
  if (!engine) return { ok: false, reason: "envelope engine missing" };
  const command = engine.endsWith(".nu") ? "nu" : "bash";
  const out = execFileSync(command, [engine, "probe", "--id", "reattach-check"], {
    encoding: "utf8",
    timeout: 60000,
  });
  const probe = JSON.parse(out.trim().split("\n").pop());
  return { ok: probe.pid === 2, probe };
}

// (2) Re-attach the durable plane: every durable root present (and writable
// where required) — matching the tier map, owned by this user.
export function reattachDurablePlane() {
  const results = DURABLE_ROOTS.map((r) => {
    const exists = existsSync(r.path);
    let writable = null;
    let owned = null;
    if (exists) {
      const st = statSync(r.path);
      owned = st.uid === process.getuid();
      if (r.need === "writable") {
        try {
          const probe = `${r.path}/.reattach-probe`;
          writeFileSync(probe, "ok");
          execFileSync("rm", ["-f", probe]);
          writable = true;
        } catch {
          writable = false;
        }
      }
    }
    return { ...r, exists, owned, writable, ok: exists && (r.need !== "writable" || writable === true) };
  });
  return { ok: results.every((r) => r.ok), roots: results };
}

// (3) Ordered health verification. Only Yazelix may start or repair services.
export async function startServicesOrdered(services) {
  const report = [];
  for (const svc of [...services].sort((a, b) => a.order - b.order)) {
    const healthy = () => {
      if (svc.healthTcp) {
        return new Promise((res) => {
          const s = connect({ port: svc.healthTcp, host: "127.0.0.1" });
          s.once("connect", () => { s.destroy(); res(true); });
          s.once("error", () => res(false));
        });
      }
      try { execFileSync(svc.health[0], svc.health.slice(1), { timeout: 10000 }); return Promise.resolve(true); }
      catch { return Promise.resolve(false); }
    };
    let up = await healthy();
    report.push({ name: svc.name, order: svc.order, healthy: up, started: false });
    if (!up) {
      // Health-gated: a failed dependency stops the chain and surfaces.
      return { ok: false, failed: svc.name, report };
    }
  }
  return { ok: true, report };
}

// (4) Re-expose resumable sessions from the DURABLE transcript store — the
// store that survived the 2026-07-21 reboot. No /run tmpfs dependency.
export function listSessions(root = resolve(process.env.CLAUDE_CONFIG_DIR ?? "/home/flexnetos/meta/var/lib/claude", "projects")) {
  if (root.startsWith("/run/")) throw new Error("session store must be durable, never /run tmpfs");
  if (!existsSync(root)) return { root, sessions: [] };
  const sessions = [];
  for (const project of readdirSync(root)) {
    const dir = `${root}/${project}`;
    if (!statSync(dir).isDirectory()) continue;
    const transcripts = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    if (transcripts.length) sessions.push({ project, transcripts: transcripts.length });
  }
  return { root, durable: true, sessions };
}

export async function reattach({ services, sessionRoot } = {}) {
  if (!services) services = productionServices();
  execFileSync(YAZELIX_STACK_BOOTSTRAP, [], { timeout: 90000, stdio: "pipe" });
  const envelope = rematerializeEnvelope();
  const durable = reattachDurablePlane();
  const svc = await startServicesOrdered(services);
  const sessions = listSessions(sessionRoot);
  const ok = envelope.ok && durable.ok && svc.ok;
  return {
    schema_version: "lifeos.evidence.boot-reattach-report.v1",
    ok,
    already_attached: ok && svc.report.every((s) => !s.started),
    envelope,
    durable,
    services: svc,
    sessions: { root: sessions.root, count: sessions.sessions.length },
  };
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const json = args.includes("--json");
  if (cmd === "sessions") {
    const rootArg = args.find((a) => a.startsWith("--root="));
    const r = listSessions(rootArg ? rootArg.slice("--root=".length) : undefined);
    process.stdout.write(`${JSON.stringify(r, null, json ? 2 : 0)}\n`);
  } else if (cmd === "reattach") {
    const svcArg = args.find((a) => a.startsWith("--services="));
    const services = svcArg
      ? JSON.parse(readFileSync(resolve(process.cwd(), svcArg.slice("--services=".length)), "utf8"))
      : productionServices();
    const r = await reattach({ services });
    const outArg = args.find((a) => a.startsWith("--output="));
    const body = `${JSON.stringify(r, null, 2)}\n`;
    if (outArg) {
      const p = resolve(process.cwd(), outArg.slice("--output=".length));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body);
    }
    process.stdout.write(body);
    process.exit(r.ok ? 0 : 1);
  } else {
    console.error("usage: boot-reattach.mjs {reattach|sessions}");
    process.exit(2);
  }
}

if (import.meta.main) main();
