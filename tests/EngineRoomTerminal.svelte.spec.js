import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import EngineRoomTerminal from "@/components/EngineRoomTerminal.svelte";

describe("EngineRoomTerminal.svelte", () => {
  afterEach(() => cleanup());

  it("mounts the xterm surface and stays calm outside the Tauri shell", () => {
    const { container } = render(EngineRoomTerminal);
    expect(container.querySelector('[role="application"]')).not.toBeNull();
    expect(container.querySelector(".status").textContent).toBe("browser preview");
    expect(container.querySelector(".terminal-hint").textContent).toContain("Tauri shell");
  });
});
