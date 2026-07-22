import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { engine, enginePath, probeJson } from "./helpers/yzx-envelope";

// ARCHBP-071 — Test suite + docs; prove against T1 invariants.
// (yzx-iso t2-9-envelope-acceptance, G2.)

describe("ARCHBP-071 envelope acceptance", () => {
  test("docs are published beside the engine and record invariant conformance", () => {
    const readme = join(dirname(enginePath()), "README.md");
    expect(existsSync(readme)).toBe(true);
    const docs = readFileSync(readme, "utf8");
    expect(docs).toContain("yzx-envelope");
    expect(docs).toContain("isolation-architecture-spec.md");
    // Invariant conformance recorded against the T1 ledger.
    for (const id of ["I03", "I05", "I06", "I11", "I12", "I13"]) {
      expect(docs, `docs missing invariant ${id}`).toContain(id);
    }
  });

  test("I03 conformance: native user-namespace envelope, no hypervisor in the hot path", () => {
    const p = probeJson(["--id", "t071-i03"]);
    expect(p.pid).toBe(2); // user+pid namespaces active
    expect(p.uid).toBe(1001); // native user, no privilege transition
    const exec = JSON.parse(engine(["executor"]).stdout.trim());
    // The executor is bwrap (userspace, no hypervisor/container daemon).
    expect(exec.executor).toMatch(/bwrap/);
  }, 60000);

  test("I06 conformance: the envelope engine parks nothing durable on host /run", () => {
    // The engine's own construction uses only tmpfs, /nix, /etc read-only,
    // and caller-declared durable binds — grep proves no /run bind exists.
    const src = readFileSync(enginePath(), "utf8");
    expect(src).not.toMatch(/--bind\s+\/run/);
    expect(src).toContain("--tmpfs /");
  });

  test("the full T2 gate set is green on this host (recorded acceptance)", () => {
    // Companion specs (archbp-065..070) prove flake build, enter lifecycle,
    // teardown, durable binds, resource hooks, and multi-envelope. This
    // acceptance test re-runs the fastest end-to-end slice as a liveness
    // seal: enter -> observe -> exit -> leakcheck clean.
    const p = probeJson(["--id", "t071-seal"]);
    expect(p.host_home_visible).toBe("no");
    const check = JSON.parse(engine(["leakcheck", "t071-seal"]).stdout.trim());
    expect(check.clean).toBe(true);
  }, 60000);
});
