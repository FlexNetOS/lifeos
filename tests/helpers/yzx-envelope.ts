import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Shared resolver for the yzx-envelope engine (yazelix repo). Candidates in
// order: operator override and the canonical Yazelix checkout. The specs FAIL
// (never skip) when the engine is absent —
// this suite proves the envelope on the target host.
const CANDIDATES = [
  process.env.YZX_ENVELOPE_BIN,
  "/home/flexnetos/meta/src/yazelix/envelope/yzx-envelope.nu",
].filter(Boolean) as string[];

export const YAZELIX_ROOTS = [
  "/home/flexnetos/meta/src/yazelix",
];

export function enginePath(): string {
  const found = CANDIDATES.find((c) => existsSync(c));
  if (!found) throw new Error(`yzx-envelope engine not found in: ${CANDIDATES.join(", ")}`);
  return found;
}

export function engine(args: string[], opts: { timeoutMs?: number } = {}) {
  const path = enginePath();
  const command = path.endsWith(".nu") ? "nu" : "bash";
  return spawnSync(command, [path, ...args], {
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 60000,
  });
}

export function probeJson(args: string[] = []): Record<string, unknown> {
  const r = engine(["probe", ...args]);
  if (r.status !== 0) throw new Error(`probe failed: ${r.stderr}`);
  return JSON.parse(r.stdout.trim().split("\n").pop() as string);
}

// In-envelope commands must resolve to /nix/store paths (only /nix is bound
// inside). Resolve the store bash once.
export const BASH = spawnSync("bash", ["-c", 'readlink -f "$(command -v bash)"'], {
  encoding: "utf8",
}).stdout.trim();
