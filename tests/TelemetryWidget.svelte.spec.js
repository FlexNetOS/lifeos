// Svelte counterpart of tests/TelemetryWidget.spec.js — same assertions against
// the Svelte port (src/components/TelemetryWidget.svelte).
// Verifies the widget mounts cleanly outside Tauri (placeholder mode),
// renders real values when window.__TAURI__.core.invoke returns a snapshot,
// and tears down its polling interval on unmount.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import { createPinia, setActivePinia } from "pinia";
import TelemetryWidget from "@/components/TelemetryWidget.svelte";
import { useLifeos } from "@/stores/lifeos.js";

// Microtask-based (not setTimeout-based) so it also resolves under
// vi.useFakeTimers, matching how the fake-timer tests below use it.
const flushPromises = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const fakeSnapshot = {
  cpu_percent: 42.7,
  memory_used_bytes: 8 * 1024 ** 3,        // 8 GB
  memory_total_bytes: 32 * 1024 ** 3,      // 32 GB
  network_rx_bytes: 5 * 1024 ** 2,         // 5 MB
  network_tx_bytes: 1 * 1024 ** 2,         // 1 MB
  uptime_seconds: 90061,                    // 1d 1h 1m 1s
  hostname: "lifeos-test",
  os_name: "Ubuntu",
  os_version: "24.04",
};

const setTauri = (invoke) => {
  // happy-dom honours plain property assignments on window.
  window.__TAURI__ = invoke ? { core: { invoke } } : undefined;
};

describe("TelemetryWidget.svelte", () => {
  let errorSpy;
  let pinia;

  beforeEach(() => {
    setTauri(null);
    pinia = createPinia();
    setActivePinia(pinia);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    setTauri(null);
    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  it("mounts cleanly outside Tauri without console.error", () => {
    const { container } = render(TelemetryWidget);
    expect(container.querySelector(".telemetry-row")).not.toBeNull();
    expect(container.querySelector(".telemetry-placeholder")).not.toBeNull();
    expect(container.querySelector(".telemetry-card")).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("renders four telemetry cards with CPU + memory text when Tauri returns a snapshot", async () => {
    const invoke = vi.fn().mockResolvedValue(fakeSnapshot);
    setTauri(invoke);

    const { container } = render(TelemetryWidget);
    // onMount fires synchronously; pollOnce resolves on the next microtask.
    await flushPromises();
    await tick();

    expect(invoke).toHaveBeenCalledWith("telemetry_read");

    const cards = container.querySelectorAll(".telemetry-card");
    expect(cards.length).toBe(4);

    const text = container.textContent;
    expect(text).toContain("CPU");
    expect(text).toContain("43%");                 // 42.7 rounds via toFixed(0)
    expect(text).toContain("Memory");
    expect(text).toContain("8.00 GB");
    expect(text).toContain("of 32.0 GB");
    expect(text).toContain("Network");
    expect(text).toContain("Uptime");
    expect(text).toContain("1d 1h");
    expect(text).toContain("lifeos-test");
  });

  it("clears the polling interval on unmount", () => {
    vi.useFakeTimers();
    const invoke = vi.fn().mockResolvedValue(fakeSnapshot);
    setTauri(invoke);
    const clearSpy = vi.spyOn(globalThis, "clearInterval");

    const { unmount } = render(TelemetryWidget);
    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("renders the paused placeholder when telemetryEnabled is false in Tauri host", async () => {
    const invoke = vi.fn().mockResolvedValue(fakeSnapshot);
    setTauri(invoke);
    const store = useLifeos();
    store.setTelemetryEnabled(false);

    const { container } = render(TelemetryWidget);
    await flushPromises();

    const placeholder = container.querySelector(".telemetry-placeholder");
    expect(placeholder).not.toBeNull();
    expect(placeholder.textContent).toMatch(/paused/i);
    expect(container.querySelectorAll(".telemetry-card").length).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("restarts the polling interval when telemetryRefreshMs changes", async () => {
    vi.useFakeTimers();
    const invoke = vi.fn().mockResolvedValue(fakeSnapshot);
    setTauri(invoke);
    const store = useLifeos();

    const { unmount } = render(TelemetryWidget);
    await flushPromises();
    invoke.mockClear();

    store.setTelemetryRefreshMs(5000);
    await flushPromises();

    // Drive the interval forward to verify the new rate is honoured.
    vi.advanceTimersByTime(5000);
    expect(invoke).toHaveBeenCalled();

    unmount();
  });
});
