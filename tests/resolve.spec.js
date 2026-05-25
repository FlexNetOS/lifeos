import { describe, it, expect } from "vitest";
import { resolveWorkspace, flow } from "@/lib/resolve.js";

describe("resolveWorkspace", () => {
  it("returns the profile for id='settings'", () => {
    const ws = resolveWorkspace("settings");
    expect(ws?.title).toBe("Settings & Profile");
  });

  it("returns the workspace by id", () => {
    expect(resolveWorkspace("ai").title).toBe("AI Command Center");
    expect(resolveWorkspace("work").title).toBe("Work");
  });

  it("returns null for null/undefined", () => {
    expect(resolveWorkspace(null)).toBe(null);
    expect(resolveWorkspace(undefined)).toBe(null);
  });

  it("synthesizes a synced view from aggregators for footer ids", () => {
    const ws = resolveWorkspace("calendar");
    expect(ws.synced).toBe(true);
    expect(ws.sections.length).toBeGreaterThan(0);
    // Origin tags should be present on items
    expect(ws.sections[0].items[0]._origin).toBeTruthy();
  });

  it("returns a No-data shell when aggregator is missing", () => {
    // No 'unknown' aggregator registered
    globalThis.LIFEOS_DATA.railFooter.push({ id: "unknown", tooltip: "Unknown" });
    const ws = resolveWorkspace("unknown");
    expect(ws.sections[0].title).toBe("No data");
    globalThis.LIFEOS_DATA.railFooter.pop();
  });
});

describe("flow", () => {
  it("returns a flow definition for a known id", () => {
    expect(flow("day").nodes.length).toBe(3);
  });
  it("returns null for unknown flows", () => {
    expect(flow("nope")).toBe(null);
  });
});
