import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
// @ts-expect-error mjs module
import { listSessions } from "../scripts/boot-reattach.mjs";

// ARCHBP-097 — Re-expose claude/codex session transcripts from the durable
// plane for resume. ARCHBP-098 — One command that performs full re-attach.
// (yzx-iso t7, G7.)

const repoRoot = resolve(import.meta.dirname, "..");
const engine = resolve(repoRoot, "scripts/boot-reattach.mjs");

describe("ARCHBP-097 durable session re-exposure", () => {
  test("sessions are listed from the durable store that survived the real reboot", () => {
    const r = listSessions();
    expect(r.durable).toBe(true);
    expect(r.root).toBe("/home/flexnetos/meta/var/lib/claude/projects");
    expect(r.sessions.every((s: { transcripts: number }) => s.transcripts > 0)).toBe(true);
  });

  test("no tmpfs dependency: a /run-based session root is rejected outright", () => {
    expect(() => listSessions("/run/user/4242/anything")).toThrow(/durable, never \/run/);
  });
});

describe("ARCHBP-098 one-command full re-attach", () => {
  test("the single command performs the full re-attach and is idempotent", () => {
    const run = () =>
      spawnSync("bun", [engine, "reattach"], { cwd: repoRoot, encoding: "utf8", timeout: 90000 });
    const first = run();
    expect(first.status, first.stderr).toBe(0);
    const r1 = JSON.parse(first.stdout);
    expect(r1.ok).toBe(true);
    expect(r1.envelope.ok).toBe(true);
    expect(r1.durable.ok).toBe(true);
    expect(r1.services.ok).toBe(true);
    expect(r1.sessions.count).toBeGreaterThanOrEqual(0);
    // Idempotent: the second run finds everything attached and no-ops.
    const second = run();
    expect(second.status, second.stderr).toBe(0);
    const r2 = JSON.parse(second.stdout);
    expect(r2.ok).toBe(true);
    expect(r2.already_attached).toBe(true);
  }, 200000);

  test("the command is Yazelix-owned and ships no unit", () => {
    expect(existsSync(resolve(repoRoot, "evidence/isolation/lifeos-reattach.service"))).toBe(false);
    const src = readFileSync(engine, "utf8");
    expect(src).toContain("Subcommands:");
    expect(src).toContain("YAZELIX_STACK_BOOTSTRAP");
    expect(src).not.toContain("systemctl");
  });
});
