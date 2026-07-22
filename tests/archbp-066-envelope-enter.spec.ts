import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { BASH, engine, enginePath, probeJson } from "./helpers/yzx-envelope";

// ARCHBP-066 — Namespace setup, env injection, cwd, shell (nu inside only).
// (yzx-iso t2-3-enter-lifecycle, G2.)

describe("ARCHBP-066 envelope enter lifecycle", () => {
  test("enter starts a real namespaced envelope and runs the command", () => {
    const r = engine(["enter", "--id", "t066", "--", BASH, "-c", "echo entered-ok"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("entered-ok");
  }, 60000);

  test("namespace setup: private pid ns, private mount table, home overlay", () => {
    const p = probeJson(["--id", "t066-ns"]);
    expect(p.pid).toBe(2); // private PID namespace — the probe is pid 2
    expect(Number(p.mounts)).toBeLessThan(30); // private minimal mount table
    expect(p.host_home_visible).toBe("no"); // tmpfs home overlay hides ~/.claude
    expect(p.hostname).toBe("yzx-envelope"); // private UTS namespace
    expect(p.uid).toBe(1001); // native user, no privilege change
  }, 60000);

  test("env is cleared then injected as declared; cwd is set", () => {
    const injected = probeJson(["--id", "t066-env", "--env", "YZX_PROBE_VAR=tier-declared", "--cwd", "/tmp"]);
    expect(injected.probe_env).toBe("tier-declared");
    expect(injected.cwd).toBe("/tmp");
    // Without injection the variable is absent — clearenv holds, host env
    // does not leak through.
    const clean = probeJson(["--id", "t066-clean"]);
    expect(clean.probe_env).toBe("unset");
  }, 60000);

  test("nu is the only default in-envelope shell; the host shell is untouched", () => {
    const src = readFileSync(enginePath(), "utf8");
    expect(src).toMatch(/command -v nu/);
    expect(src).toContain("only interactive shell inside the envelope is nu");
    // Host login shell record is not modified by envelope runs.
    const before = readFileSync("/etc/passwd", "utf8");
    engine(["enter", "--id", "t066-shell", "--", BASH, "-c", "true"]);
    expect(readFileSync("/etc/passwd", "utf8")).toBe(before);
  }, 60000);
});
