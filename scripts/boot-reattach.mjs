// yzx-iso T7 (spine ARCHBP-093..098) — boot re-attach of the isolation
// envelope, durable services, and resumable sessions, per the ratified
// isolation spec v1.0.0 (Survival = durable tier + re-attach, I10).
//
// Subcommands:
//   reattach [--services PATH] [--json]   full idempotent re-attach sequence
//   sessions [--root PATH] [--json]       list resumable sessions (durable only)
//   unit                                  print the declarative user unit
// The engine touches NO host system service: it is triggered by a systemd
// USER unit (docs/lifeos-reattach.service) or invoked directly — the single
// deliberate command of G7. Runs under Bun/Node.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { connect } from "node:net";
import { resolve, dirname } from "node:path";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");

// Durable roots re-attached at boot — exactly the T1.2/T3/T4 durable tier.
const DURABLE_ROOTS = [
  { name: "meta-var-lib", path: "/home/flexnetos/meta/var/lib", need: "exists" },
  { name: "postgres-datadir", path: "/home/flexnetos/meta/var/lib/postgresql", need: "exists" },
  { name: "xdg-data", path: "/home/flexnetos/meta/var/xdg-data", need: "writable" },
];

// Production service order (postgres -> redb -> front door). Health gates are
// real; postgres actually STARTS from the intact durable datadir with a
// user-owned socket dir — the canonical macro-state comes back up at
// re-attach, exactly what the 2026-07-21 incident lacked.
function pgBin() {
  // Path law: the profile frontdoor is the sole sanctioned launcher — it wraps
  // the postgresql-and-plugins build whose share dir carries ruvector. A bare
  // postgresql-17.10 store path starts a server that cannot load the canonical
  // extension ($libdir/ruvector missing) while TCP health still passes — the
  // defect that ran the cluster extension-less after the 2026-07-21 incident.
  const candidates = [
    "test -x /home/flexnetos/.nix-profile/bin/pg_ctl && echo /home/flexnetos/.nix-profile/bin/pg_ctl",
    "ls -d /nix/store/*-flexnetos-foundation-postgresql-frontdoors-*-ruvector-*/bin/pg_ctl 2>/dev/null | head -1",
    "ls -d /nix/store/*-postgresql-and-plugins-17.10/bin/pg_ctl 2>/dev/null | head -1",
  ];
  for (const probe of candidates) {
    try {
      const hit = execFileSync("bash", ["-c", probe], { encoding: "utf8" }).trim();
      if (hit) return hit;
    } catch { /* next candidate */ }
  }
  return null;
}

const PG_DATA = "/home/flexnetos/meta/var/lib/postgresql/17";
const PG_SOCKET_DIR = "/home/flexnetos/meta/var/run/postgresql";

export function productionServices() {
  const pgCtl = pgBin();
  mkdirSync(PG_SOCKET_DIR, { recursive: true });
  return [
    {
      name: "postgresql-ruvector",
      order: 1,
      healthTcp: 5432,
      timeoutMs: 20000,
      start: pgCtl
        ? [pgCtl, "-D", PG_DATA, "-l", `${PG_DATA}/logfile`, "-o",
           `-c unix_socket_directories='${PG_SOCKET_DIR}' -c listen_addresses='127.0.0.1'`, "start"]
        : undefined,
    },
    // The transient plane's declared home (tier map redb-plane entry); the
    // first re-attach initializes it, later runs find it — idempotent.
    { name: "redb-plane", order: 2, health: ["test", "-d", "/home/flexnetos/meta/var/lib/redb"], start: ["mkdir", "-p", "/home/flexnetos/meta/var/lib/redb"], timeoutMs: 5000 },
    { name: "glass-engine-frontdoor", order: 3, health: ["test", "-x", "/home/flexnetos/.nix-profile/bin/yzx"] },
  ];
}

const ENGINE_CANDIDATES = [
  process.env.YZX_ENVELOPE_BIN,
  "/home/flexnetos/meta/src/yazelix/envelope/yzx-envelope.sh",
  "/home/flexnetos/meta/src/yazelix/.claude/worktrees/archbp-065-envelope/envelope/yzx-envelope.sh",
].filter(Boolean);

export function envelopeEngine() {
  return ENGINE_CANDIDATES.find((c) => existsSync(c)) ?? null;
}

// (1) Re-materialize the envelope: construct a live envelope and observe it.
export function rematerializeEnvelope() {
  const engine = envelopeEngine();
  if (!engine) return { ok: false, reason: "envelope engine missing" };
  const out = execFileSync("bash", [engine, "probe", "--id", "reattach-check"], {
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

// (3) Ordered, health-gated service startup. Each service: if health passes,
// it is already up (idempotent); otherwise run start (if given) and poll
// health until timeout. A failure is surfaced, never swallowed.
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
    let started = false;
    if (!up && svc.start) {
      const deadline = Date.now() + (svc.timeoutMs ?? 10000);
      // Under load a spawn can fail transiently (EAGAIN); retry within the
      // health window rather than crashing — the failure still surfaces if
      // health never passes.
      while (!started && Date.now() < deadline) {
        try {
          const child = spawn(svc.start[0], svc.start.slice(1), { detached: true, stdio: "ignore" });
          child.on("error", () => {});
          child.unref();
          started = true;
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      while (!up && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
        up = await healthy();
      }
    }
    report.push({ name: svc.name, order: svc.order, healthy: up, started });
    if (!up) {
      // Health-gated: a failed dependency stops the chain and surfaces.
      return { ok: false, failed: svc.name, report };
    }
  }
  return { ok: true, report };
}

// (4) Re-expose resumable sessions from the DURABLE transcript store — the
// store that survived the 2026-07-21 reboot. No /run tmpfs dependency.
export function listSessions(root = "/home/flexnetos/.claude/projects") {
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
  const envelope = rematerializeEnvelope();
  const durable = reattachDurablePlane();
  const svc = await startServicesOrdered(services);
  const sessions = listSessions(sessionRoot);
  const ok = envelope.ok && durable.ok && svc.ok;
  return {
    schema_version: "lifeos-planning-spine.boot-reattach-report.v0",
    ok,
    already_attached: ok && svc.report.every((s) => !s.started),
    envelope,
    durable,
    services: svc,
    sessions: { root: sessions.root, count: sessions.sessions.length },
  };
}

const UNIT = `# lifeos-reattach.service — systemd USER unit (login-triggered, idempotent).
# Installs under ~/.config/systemd/user/ (or the profile-owned equivalent):
#   systemctl --user enable lifeos-reattach.service
# It couples to NO host system service: WantedBy=default.target fires at user
# login/boot session start, After= orders only against the user session bus.
[Unit]
Description=LifeOS envelope + durable-state re-attach (yzx-iso T7)
# No Requires=/BindsTo= on any host system unit: the host boots freely (G1).

[Service]
Type=oneshot
# The single deliberate command (ARCHBP-098); safe to re-run any time.
ExecStart=/home/flexnetos/.nix-profile/toolbin/bun ${repoRoot}/scripts/boot-reattach.mjs reattach --json
RemainAfterExit=yes

[Install]
WantedBy=default.target
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const json = args.includes("--json");
  if (cmd === "unit") {
    process.stdout.write(UNIT);
  } else if (cmd === "sessions") {
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
    console.error("usage: boot-reattach.mjs {reattach|sessions|unit}");
    process.exit(2);
  }
}

if (import.meta.main) main();
