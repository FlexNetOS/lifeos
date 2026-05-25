// LifeOS — JS/TS store-sibling parity (Phase 4 #5).
// Per sot.md + the user's Stage 2 directive, src/stores/lifeos.js (in-browser preview)
// and src/stores/lifeos.ts (typed production) must expose the same surface.
// Same applies to src/lib/resolve.{js,ts} and src/lib/nav.{js,ts}.
// Toasts store parity added in Phase 5.

import { describe, it, expect } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useLifeos as useJs } from "@/stores/lifeos.js";
import { useLifeos as useTs } from "@/stores/lifeos.ts";
import { useToasts as useToastsJs } from "@/stores/toasts.js";
import { useToasts as useToastsTs } from "@/stores/toasts.ts";
import { resolveWorkspace as resolveJs, flow as flowJs } from "@/lib/resolve.js";
import { resolveWorkspace as resolveTs, flow as flowTs } from "@/lib/resolve.ts";
import { buildPath as buildPathJs, useNav as useNavJs } from "@/lib/nav.js";
import { buildPath as buildPathTs, useNav as useNavTs } from "@/lib/nav.ts";

function describeStore(useStore) {
  setActivePinia(createPinia());
  const s = useStore();
  const state = Object.keys(s.$state).sort();
  // Pinia exposes actions as own enumerable props on the store proxy. Filter to fns.
  const actions = Object.keys(s)
    .filter((k) => typeof s[k] === "function" && !k.startsWith("$") && !state.includes(k))
    .sort();
  return { state, actions };
}

describe("store sibling parity — lifeos.js ↔ lifeos.ts", () => {
  it("expose the same state keys", () => {
    const js = describeStore(useJs);
    const ts = describeStore(useTs);
    expect(ts.state).toEqual(js.state);
  });
  it("expose the same action names", () => {
    const js = describeStore(useJs);
    const ts = describeStore(useTs);
    expect(ts.actions).toEqual(js.actions);
  });
});

describe("resolver sibling parity — resolve.js ↔ resolve.ts", () => {
  it("resolveWorkspace returns equivalent shape for the same id", () => {
    const a = resolveJs("ai");
    const b = resolveTs("ai");
    expect(b?.title).toBe(a?.title);
    expect(b?.sections?.length).toBe(a?.sections?.length);
  });
  it("flow() returns the same node count for a known id", () => {
    expect(flowTs("day")?.nodes?.length).toBe(flowJs("day")?.nodes?.length);
  });
  it("flow() returns null for unknown ids in both", () => {
    expect(flowJs("nope")).toBe(null);
    expect(flowTs("nope")).toBe(null);
  });
});

describe("nav sibling parity — nav.js ↔ nav.ts", () => {
  it("buildPath agrees on workspace + section + sub", () => {
    expect(buildPathTs("ai", "Agent Teams", "Day Captain"))
      .toBe(buildPathJs("ai", "Agent Teams", "Day Captain"));
  });
  it("buildPath agrees on settings", () => {
    expect(buildPathTs("settings", "Profile")).toBe(buildPathJs("settings", "Profile"));
  });
  it("both export useNav as a function", () => {
    expect(typeof useNavJs).toBe("function");
    expect(typeof useNavTs).toBe("function");
  });
});

describe("store sibling parity — toasts.js ↔ toasts.ts", () => {
  it("expose the same state keys", () => {
    const js = describeStore(useToastsJs);
    const ts = describeStore(useToastsTs);
    expect(ts.state).toEqual(js.state);
  });
  it("expose the same action names", () => {
    const js = describeStore(useToastsJs);
    const ts = describeStore(useToastsTs);
    expect(ts.actions).toEqual(js.actions);
  });
});
