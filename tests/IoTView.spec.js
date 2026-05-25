// LifeOS — IoTView SFC tests.
// Covers: canvas renders, summary line, room chips, filter toggle,
// device list roles, signal strength card, offline device state.

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import IoTView from "@/components/IoTView.vue";

describe("IoTView.vue", () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  const mountIt = () => mount(IoTView, { global: { plugins: [pinia] } });

  it("renders .iot-canvas with the correct region label", () => {
    const w = mountIt();
    const canvas = w.find(".iot-canvas");
    expect(canvas.exists()).toBe(true);
    expect(canvas.attributes("role")).toBe("region");
    expect(canvas.attributes("aria-label")).toBe("IoT devices");
  });

  it("renders the summary line with online / total / room counts", () => {
    const w = mountIt();
    const summary = w.find(".lights-summary");
    expect(summary.exists()).toBe(true);
    // fixture: 4 online (d1 d2 d3 d5), 5 total, 3 rooms
    expect(summary.text()).toMatch(/4 of 5 online/);
    expect(summary.text()).toMatch(/3 rooms/);
  });

  it("renders all room chips as a radiogroup with one chip per room plus All rooms", () => {
    const w = mountIt();
    const group = w.find('[role="radiogroup"]');
    expect(group.exists()).toBe(true);
    const chips = group.findAll('[role="radio"]');
    // 1 "All rooms" + 3 rooms from fixture
    expect(chips.length).toBe(4);
    expect(chips[0].text()).toContain("All rooms");
    expect(chips[0].attributes("aria-checked")).toBe("true");
  });

  it("clicking a room chip filters the device list to that room only", async () => {
    const w = mountIt();
    const chips = w.findAll('[role="radio"]');
    // Click "Living room" chip (index 1)
    await chips[1].trigger("click");
    expect(chips[1].attributes("aria-checked")).toBe("true");
    expect(chips[0].attributes("aria-checked")).toBe("false");

    // Only living room devices should appear: d1 (Smart TV) + d2 (Soundbar)
    const deviceList = w.find(".iot-device-list");
    const items = deviceList.findAll('[role="listitem"]');
    expect(items.length).toBe(2);
    const labels = items.map((i) => i.text());
    expect(labels.some((t) => t.includes("Smart TV"))).toBe(true);
    expect(labels.some((t) => t.includes("Soundbar"))).toBe(true);
  });

  it("clicking the active room chip again resets to All rooms", async () => {
    const w = mountIt();
    const chips = w.findAll('[role="radio"]');
    await chips[1].trigger("click");
    await chips[1].trigger("click");
    // Back to all — 5 devices total
    const deviceList = w.find(".iot-device-list");
    const items = deviceList.findAll('[role="listitem"]');
    expect(items.length).toBe(5);
    expect(chips[0].attributes("aria-checked")).toBe("true");
  });

  it("device rows have role=list and role=listitem", () => {
    const w = mountIt();
    const list = w.find(".iot-device-list");
    expect(list.exists()).toBe(true);
    expect(list.attributes("role")).toBe("list");
    const items = list.findAll('[role="listitem"]');
    // fixture: 5 devices total
    expect(items.length).toBe(5);
  });

  it("each device row has an aria-label", () => {
    const w = mountIt();
    const items = w.find(".iot-device-list").findAll('[role="listitem"]');
    items.forEach((item) => {
      expect(item.attributes("aria-label")).toBeTruthy();
    });
  });

  it("online devices appear before offline devices", () => {
    const w = mountIt();
    const items = w.find(".iot-device-list").findAll('[role="listitem"]');
    // Last item should be the offline device (d4 Air sensor)
    expect(items.at(-1).text()).toContain("Air sensor");
    expect(items.at(-1).classes()).toContain("iot-device-row--offline");
  });

  it("offline device row has iot-device-row--offline class", () => {
    const w = mountIt();
    const items = w.find(".iot-device-list").findAll('[role="listitem"]');
    const offline = items.filter((i) => i.classes().includes("iot-device-row--offline"));
    expect(offline.length).toBe(1); // fixture: 1 offline device (d4)
  });

  it("low-battery device has 'low battery' text in aria-label and visible label", () => {
    const w = mountIt();
    // d4 has battery: 8 — below 20 threshold
    const items = w.find(".iot-device-list").findAll('[role="listitem"]');
    const lowBat = items.find((i) => i.attributes("aria-label")?.includes("low battery"));
    expect(lowBat).toBeTruthy();
    // The battery span text should also contain "low battery"
    const batSpan = lowBat.find(".iot-device-battery--low");
    expect(batSpan.exists()).toBe(true);
    expect(batSpan.text()).toContain("low battery");
  });

  it("signal strength card renders all signals from fixture", () => {
    const w = mountIt();
    const signalList = w.find(".iot-signal-list");
    expect(signalList.exists()).toBe(true);
    const signalItems = signalList.findAll('[role="listitem"]');
    // fixture has 4 signals
    expect(signalItems.length).toBe(4);
    const labels = signalItems.map((i) => i.text());
    expect(labels.some((t) => t.includes("WAN"))).toBe(true);
    expect(labels.some((t) => t.includes("Wi-Fi 5"))).toBe(true);
    expect(labels.some((t) => t.includes("Mesh nodes"))).toBe(true);
  });

  it("latency card shows average and a status pill", () => {
    const w = mountIt();
    const latCard = w.find('[aria-label="Average latency"]');
    expect(latCard.exists()).toBe(true);
    // fixture online devices with latency: d1=12, d2=8, d3=22, d5=31 → avg = 18
    const val = latCard.find(".iot-latency-value");
    expect(val.text()).toBe("18 ms");
    const pill = latCard.find('[class*="iot-latency-pill"]');
    expect(pill.exists()).toBe(true);
    expect(pill.text()).toBe("Good");
  });

  it("shows empty state when iot data is missing", () => {
    const original = window.LIFEOS_DATA.iot;
    window.LIFEOS_DATA.iot = { rooms: [], devices: [], signals: [] };
    const w = mountIt();
    expect(w.find(".sub-empty").exists()).toBe(true);
    window.LIFEOS_DATA.iot = original;
  });
});
