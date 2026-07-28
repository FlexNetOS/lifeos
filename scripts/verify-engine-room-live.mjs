// ARCHBP-003/004 — exercise the installed yzx -> Zellij -> Nushell boundary.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const yzx = "/home/flexnetos/.nix-profile/bin/yzx";
const session = process.env.LIFEOS_ENGINE_SESSION_NAME ?? `lifeos-engine-${Date.now()}`;
const receiptPath = join(root, "evidence/engine-room/live-receipt.json");

function snapshot() {
  try {
    return execFileSync("ps", ["-eo", "pid=,ppid=,comm=,args="], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((line) =>
        line.includes(session) || /yzx-welcome|zellij|nushell.*env-config/i.test(line),
      );
  } catch {
    return [];
  }
}

const startedAt = Date.now();
const child = spawn(
  "/usr/bin/script",
  ["-qfec", `${yzx} enter --session ${session}`, "/dev/null"],
  {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      TERM: process.env.TERM ?? "xterm-256color",
      YAZELIX_SESSION_TERMINAL: "lifeos-engine-room-probe",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
child.stdout.on("data", (chunk) => {
  output = `${output}${chunk}`.slice(-16_384);
});
child.stderr.on("data", (chunk) => {
  output = `${output}${chunk}`.slice(-16_384);
});

let ready = false;
const deadline = Date.now() + 12_000;
while (Date.now() < deadline) {
  const tree = snapshot();
  ready =
    tree.some((line) => new RegExp(`zellij.*${session}`, "i").test(line)) &&
    tree.some((line) => /\bnu\b.*--env-config.*env\.nu/i.test(line));
  if (ready) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const processTree = snapshot();
let shutdown = { signal: "SIGTERM", exit_code: null };
try {
  process.kill(-child.pid, "SIGTERM");
} catch {
  // The child may have exited after its managed session was closed.
}
await new Promise((resolve) => {
  const timer = setTimeout(resolve, 5_000);
  child.once("exit", (code, signal) => {
    clearTimeout(timer);
    shutdown = { signal, exit_code: code };
    resolve();
  });
});

const result = {
  schema_version: "lifeos.evidence.engine-room-live.v1",
  authority: "installed yzx executable and live Zellij/Nushell process tree",
  observed_at: new Date().toISOString(),
  started_at: new Date(startedAt).toISOString(),
  argv: ["yzx", "enter", "--session", session],
  session,
  process_tree: processTree,
  nushell_config: "/run/user/1001/yazelix/profile-runtime/yazelix/nu/env.nu",
  output_tail: output.slice(-4096),
  ready,
  shutdown,
  ok: ready && (shutdown.signal === "SIGTERM" || shutdown.exit_code === 0),
};
if (!result.ok) throw new Error(JSON.stringify(result));
mkdirSync(join(root, "evidence/engine-room"), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: receiptPath, session, shutdown }, null, 2));
