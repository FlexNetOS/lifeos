// Svelte counterpart of tests/IoTView.spec.js — same assertions, same fixture,
// against the Svelte port (src/components/IoTView.svelte) instead of IoTView.vue.
// Covers: canvas renders, summary line, room chips, filter toggle,
// device list roles, signal strength card, offline device state.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import IoTView from "@/components/IoTView.svelte";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/workspace/:id?/:section?/:sub?", component: { template: "<div />" } },
    { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
    { path: "/", redirect: "/workspace/ai" },
  ],
});

describe("IoTView.svelte", () => {
  let pinia, router;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = makeRouter();
    await router.push("/");
    await router.isReady();
  });

  afterEach(() => cleanup());

  const mountIt = () => render(IoTView, { props: { router } });

  it("renders .iot-canvas with the correct region label", () => {
    const { container } = mountIt();
    const canvas = container.querySelector(".iot-canvas");
    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute("role")).toBe("region");
    expect(canvas.getAttribute("aria-label")).toBe("IoT devices");
  });

  it("renders the summary line with online / total / room counts", () => {
    const { container } = mountIt();
    const summary = container.querySelector(".lights-summary");
    expect(summary).not.toBeNull();
    // fixture: 4 online (d1 d2 d3 d5), 5 total, 3 rooms
    expect(summary.textContent).toMatch(/4 of 5 online/);
    expect(summary.textContent).toMatch(/3 rooms/);
  });

  it("renders all room chips as a radiogroup with one chip per room plus All rooms", () => {
    const { container } = mountIt();
    const group = container.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    const chips = group.querySelectorAll('[role="radio"]');
    // 1 "All rooms" + 3 rooms from fixture
    expect(chips.length).toBe(4);
    expect(chips[0].textContent).toContain("All rooms");
    expect(chips[0].getAttribute("aria-checked")).toBe("true");
  });

  it("clicking a room chip filters the device list to that room only", async () => {
    const { container } = mountIt();
    const chips = container.querySelectorAll('[role="radio"]');
    // Click "Living room" chip (index 1)
    await fireEvent.click(chips[1]);
    expect(chips[1].getAttribute("aria-checked")).toBe("true");
    expect(chips[0].getAttribute("aria-checked")).toBe("false");

    // Only living room devices should appear: d1 (Smart TV) + d2 (Soundbar)
    const deviceList = container.querySelector(".iot-device-list");
    const items = deviceList.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(2);
    const labels = Array.from(items).map((i) => i.textContent);
    expect(labels.some((t) => t.includes("Smart TV"))).toBe(true);
    expect(labels.some((t) => t.includes("Soundbar"))).toBe(true);
  });

  it("clicking the active room chip again resets to All rooms", async () => {
    const { container } = mountIt();
    const chips = container.querySelectorAll('[role="radio"]');
    await fireEvent.click(chips[1]);
    await fireEvent.click(chips[1]);
    // Back to all — 5 devices total
    const deviceList = container.querySelector(".iot-device-list");
    const items = deviceList.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(5);
    expect(chips[0].getAttribute("aria-checked")).toBe("true");
  });

  it("device rows have role=list and role=listitem", () => {
    const { container } = mountIt();
    const list = container.querySelector(".iot-device-list");
    expect(list).not.toBeNull();
    expect(list.getAttribute("role")).toBe("list");
    const items = list.querySelectorAll('[role="listitem"]');
    // fixture: 5 devices total
    expect(items.length).toBe(5);
  });

  it("each device row has an aria-label", () => {
    const { container } = mountIt();
    const items = container.querySelector(".iot-device-list").querySelectorAll('[role="listitem"]');
    items.forEach((item) => {
      expect(item.getAttribute("aria-label")).toBeTruthy();
    });
  });

  it("online devices appear before offline devices", () => {
    const { container } = mountIt();
    const items = container.querySelector(".iot-device-list").querySelectorAll('[role="listitem"]');
    // Last item should be the offline device (d4 Air sensor)
    const last = items[items.length - 1];
    expect(last.textContent).toContain("Air sensor");
    expect(last.classList.contains("iot-device-row--offline")).toBe(true);
  });

  it("offline device row has iot-device-row--offline class", () => {
    const { container } = mountIt();
    const items = container.querySelector(".iot-device-list").querySelectorAll('[role="listitem"]');
    const offline = Array.from(items).filter((i) => i.classList.contains("iot-device-row--offline"));
    expect(offline.length).toBe(1); // fixture: 1 offline device (d4)
  });

  it("low-battery device has 'low battery' text in aria-label and visible label", () => {
    const { container } = mountIt();
    // d4 has battery: 8 — below 20 threshold
    const items = Array.from(container.querySelector(".iot-device-list").querySelectorAll('[role="listitem"]'));
    const lowBat = items.find((i) => i.getAttribute("aria-label")?.includes("low battery"));
    expect(lowBat).toBeTruthy();
    // The battery span text should also contain "low battery"
    const batSpan = lowBat.querySelector(".iot-device-battery--low");
    expect(batSpan).not.toBeNull();
    expect(batSpan.textContent).toContain("low battery");
  });

  it("signal strength card renders all signals from fixture", () => {
    const { container } = mountIt();
    const signalList = container.querySelector(".iot-signal-list");
    expect(signalList).not.toBeNull();
    const signalItems = signalList.querySelectorAll('[role="listitem"]');
    // fixture has 4 signals
    expect(signalItems.length).toBe(4);
    const labels = Array.from(signalItems).map((i) => i.textContent);
    expect(labels.some((t) => t.includes("WAN"))).toBe(true);
    expect(labels.some((t) => t.includes("Wi-Fi 5"))).toBe(true);
    expect(labels.some((t) => t.includes("Mesh nodes"))).toBe(true);
  });

  it("latency card shows average and a status pill", () => {
    const { container } = mountIt();
    const latCard = container.querySelector('[aria-label="Average latency"]');
    expect(latCard).not.toBeNull();
    // fixture online devices with latency: d1=12, d2=8, d3=22, d5=31 → avg = 18
    const val = latCard.querySelector(".iot-latency-value");
    expect(val.textContent.trim()).toBe("18 ms");
    const pill = latCard.querySelector('[class*="iot-latency-pill"]');
    expect(pill).not.toBeNull();
    expect(pill.textContent.trim()).toBe("Good");
  });

  it("shows empty state when iot data is missing", () => {
    const original = window.LIFEOS_DATA.iot;
    window.LIFEOS_DATA.iot = { rooms: [], devices: [], signals: [] };
    const { container } = mountIt();
    expect(container.querySelector(".sub-empty")).not.toBeNull();
    window.LIFEOS_DATA.iot = original;
  });
});
