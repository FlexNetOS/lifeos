import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SURFACES,
  DEFAULT_SURFACE,
  MOBILE_MAX_WIDTH,
  isSurface,
  resolveSurface,
  createSurface,
} from "@/lib/surface.svelte.js";

describe("surface density — vocabulary", () => {
  it("declares exactly the four spec viewports", () => {
    expect(SURFACES).toEqual(["mobile", "workstation", "tv-10ft", "ai-glasses"]);
  });

  it("defaults to workstation — the Tauri shell target", () => {
    expect(DEFAULT_SURFACE).toBe("workstation");
  });

  it("rejects unknown surface names", () => {
    expect(isSurface("mobile")).toBe(true);
    expect(isSurface("tv")).toBe(false);
    expect(isSurface(undefined)).toBe(false);
    expect(isSurface(null)).toBe(false);
  });
});

describe("surface density — resolution precedence", () => {
  it("an explicit pin outranks every other signal", () => {
    expect(
      resolveSurface({
        pinned: "tv-10ft",
        search: "?surface=mobile",
        env: "ai-glasses",
        width: 320,
      })
    ).toBe("tv-10ft");
  });

  it("the query override outranks env and width", () => {
    expect(resolveSurface({ search: "?surface=ai-glasses", env: "mobile", width: 1920 })).toBe(
      "ai-glasses"
    );
  });

  it("accepts a query string with no leading question mark", () => {
    expect(resolveSurface({ search: "surface=tv-10ft" })).toBe("tv-10ft");
  });

  it("the build-time env target outranks width", () => {
    expect(resolveSurface({ env: "tv-10ft", width: 1920 })).toBe("tv-10ft");
  });

  it("ignores an invalid pin, query, or env and falls through", () => {
    expect(resolveSurface({ pinned: "watch", search: "?surface=fridge", env: "car", width: 1920 }))
      .toBe("workstation");
  });

  it("auto-resolves mobile at or below the breakpoint", () => {
    expect(resolveSurface({ width: MOBILE_MAX_WIDTH })).toBe("mobile");
    expect(resolveSurface({ width: 390 })).toBe("mobile");
  });

  it("auto-resolves workstation above the breakpoint", () => {
    expect(resolveSurface({ width: MOBILE_MAX_WIDTH + 1 })).toBe("workstation");
    expect(resolveSurface({ width: 1280 })).toBe("workstation");
  });

  it("never auto-detects tv-10ft or ai-glasses from width alone", () => {
    for (const width of [320, 768, 1280, 1920, 3840]) {
      expect(["mobile", "workstation"]).toContain(resolveSurface({ width }));
    }
  });

  it("falls back to the default with no signals at all", () => {
    expect(resolveSurface()).toBe(DEFAULT_SURFACE);
    expect(resolveSurface({ width: Number.NaN })).toBe(DEFAULT_SURFACE);
  });
});

describe("surface density — document binding", () => {
  let target;
  let view;
  let listeners;
  let handle;

  beforeEach(() => {
    target = document.createElement("div");
    listeners = new Map();
    view = {
      innerWidth: 1280,
      location: { search: "" },
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type) => listeners.delete(type),
    };
  });

  afterEach(() => handle?.destroy());

  it("stamps data-surface onto the target on creation", () => {
    handle = createSurface({ target, view });
    expect(target.getAttribute("data-surface")).toBe("workstation");
    expect(handle.current).toBe("workstation");
  });

  it("re-resolves when the viewport resizes", () => {
    handle = createSurface({ target, view });
    view.innerWidth = 390;
    listeners.get("resize")();
    expect(target.getAttribute("data-surface")).toBe("mobile");
    expect(handle.current).toBe("mobile");
  });

  it("set() pins a surface that width can no longer override", () => {
    handle = createSurface({ target, view });
    handle.set("tv-10ft");
    expect(target.getAttribute("data-surface")).toBe("tv-10ft");

    view.innerWidth = 390;
    listeners.get("resize")();
    expect(target.getAttribute("data-surface")).toBe("tv-10ft");
  });

  it("set(undefined) releases the pin back to auto-resolution", () => {
    handle = createSurface({ target, view, pinned: "ai-glasses" });
    expect(target.getAttribute("data-surface")).toBe("ai-glasses");

    view.innerWidth = 390;
    handle.set(undefined);
    expect(target.getAttribute("data-surface")).toBe("mobile");
  });

  it("destroy() removes the resize listener", () => {
    handle = createSurface({ target, view });
    expect(listeners.has("resize")).toBe(true);
    handle.destroy();
    expect(listeners.has("resize")).toBe(false);
    handle = undefined;
  });
});
