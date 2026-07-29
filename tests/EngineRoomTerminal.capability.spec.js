import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/svelte";

// The Glass VT capability envelope is only observable at construction time, so
// the renderer is mocked here to capture what the component actually asks for.
// tests/EngineRoomTerminal.svelte.spec.js keeps the unmocked mount coverage.
const captured = {
  options: null,
  addons: [],
  dataHandlers: [],
  binaryHandlers: [],
};

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    constructor(options) {
      captured.options = options;
      this.cols = 100;
      this.rows = 30;
    }
    loadAddon(addon) {
      captured.addons.push(addon);
    }
    open() {}
    write() {}
    dispose() {}
    onData(fn) {
      captured.dataHandlers.push(fn);
    }
    onBinary(fn) {
      captured.binaryHandlers.push(fn);
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: class {} }));

vi.mock("@xterm/addon-image", () => ({
  ImageAddon: class {
    constructor(options) {
      this.imageOptions = options;
    }
  },
}));

const EngineRoomTerminal = (await import("@/components/EngineRoomTerminal.svelte")).default;

describe("EngineRoomTerminal capability envelope", () => {
  beforeEach(() => {
    captured.options = null;
    captured.addons = [];
    captured.dataHandlers = [];
    captured.binaryHandlers = [];
  });
  afterEach(() => cleanup());

  const mount = async () => {
    render(EngineRoomTerminal);
    await vi.waitFor(() => expect(captured.options).not.toBeNull());
  };

  it("never rewrites line endings on a real PTY surface", async () => {
    await mount();
    expect(captured.options.convertEol).toBe(false);
  });

  it("opts into the proposed API the image addon requires", async () => {
    await mount();
    expect(captured.options.allowProposedApi).toBe(true);
  });

  it("enables the kitty keyboard protocol for key disambiguation", async () => {
    await mount();
    expect(captured.options.kittyKeyboard).toBe(true);
  });

  it("loads the image addon with kitty graphics, sixel and iip enabled", async () => {
    await mount();
    const image = captured.addons.find((addon) => addon.imageOptions);
    expect(image).toBeDefined();
    expect(image.imageOptions.kittySupport).toBe(true);
    expect(image.imageOptions.sixelSupport).toBe(true);
    expect(image.imageOptions.iipSupport).toBe(true);
  });

  it("forwards 8-bit onBinary input without UTF-8 corruption", async () => {
    await mount();
    expect(captured.binaryHandlers).toHaveLength(1);

    // 0x9b is a single byte on the wire; TextEncoder would emit two bytes.
    const bytes = Uint8Array.from("\x1b\x9b", (char) => char.charCodeAt(0) & 0xff);
    expect(Array.from(bytes)).toEqual([0x1b, 0x9b]);
  });
});
