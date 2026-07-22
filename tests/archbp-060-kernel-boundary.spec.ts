import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-060 — Record the one honest limit: namespaces share the host kernel
// (source of zero latency); reboot ends processes but never state. Survival =
// durable tier + re-attach. (yzx-iso t1-3-shared-kernel-boundary, G2/G7.)

const repoRoot = resolve(import.meta.dirname, "..");
const specPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/isolation-architecture-spec.md",
);

describe("ARCHBP-060 shared-kernel boundary", () => {
  test("the boundary and its rationale are documented", () => {
    expect(existsSync(specPath)).toBe(true);
    const spec = readFileSync(specPath, "utf8");
    // The kernel is shared — that is precisely what removes VM latency.
    expect(spec).toMatch(/shared[- ]kernel|kernel is shared/i);
    expect(spec).toMatch(/zero (hypervisor )?latency/i);
    // A host kernel-upgrade + reboot still ends LifeOS processes; it never
    // touches LifeOS state.
    expect(spec).toMatch(/reboot ends (LifeOS )?processes/i);
    expect(spec).toMatch(/never (touches|ends) (LifeOS )?state/i);
  });

  test("isolation and survival are separated as orthogonal concerns", () => {
    const spec = readFileSync(specPath, "utf8");
    expect(spec).toMatch(/orthogonal/i);
    // Survival = durable tier + re-attach.
    expect(spec).toMatch(/survival\s*=\s*durable (state )?tier \+ (clean )?(auto[- ])?re-attach/i);
  });

  test("the boundary section declares its consumer (t7 boot re-attach lane)", () => {
    const spec = readFileSync(specPath, "utf8");
    expect(spec).toContain("tasks/yzx-iso/t7-0-lane-index");
  });
});
