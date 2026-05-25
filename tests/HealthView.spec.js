import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import HealthView from "@/components/HealthView.vue";
import { useLifeos } from "@/stores/lifeos.js";

describe("HealthView.vue", () => {
  let pinia;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  const mountHealthView = () =>
    mount(HealthView, { global: { plugins: [pinia] } });

  it("mounts cleanly", () => {
    const w = mountHealthView();
    expect(w.find(".health-canvas").exists()).toBe(true);
  });

  it("renders 4 metric cards with role='img' and aria-label", () => {
    const w = mountHealthView();
    const cards = w.findAll(".health-stat-card");
    expect(cards.length).toBe(4);
    for (const card of cards) {
      expect(card.attributes("role")).toBe("img");
      expect(card.attributes("aria-label")).toBeTruthy();
    }
  });

  it("sleep chart has 7 bars (one per night)", () => {
    const w = mountHealthView();
    // Each bar is a <rect> inside the sleep SVG.
    // We find all rects — each night produces one bar rect.
    const sleepSection = w.find("#sleep-title").element.closest("section");
    const rects = sleepSection.querySelectorAll("rect");
    expect(rects.length).toBe(7);
  });

  it("activity rings section has 7 SVG groups (one per day)", () => {
    const w = mountHealthView();
    const activitySection = w.find("#activity-title").element.closest("section");
    // Each day renders one .health-activity-day div containing an svg
    const svgs = activitySection.querySelectorAll("svg");
    expect(svgs.length).toBe(7);
  });

  it("heart sparkline polyline path exists", () => {
    const w = mountHealthView();
    const heartSection = w.find("#heart-title").element.closest("section");
    const polyline = heartSection.querySelector("polyline.heart-sparkline-path");
    expect(polyline).not.toBeNull();
    expect(polyline.getAttribute("points")).toBeTruthy();
  });

  it("LifeOS suggests card has role='status' and aria-live='polite'", () => {
    const w = mountHealthView();
    const card = w.find('[role="status"][aria-live="polite"]');
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain("LifeOS suggests");
  });

  it("back button clears activeSub", async () => {
    const store = useLifeos();
    store.pickSub({ label: "Health", view: "health", icon: "heart-pulse" }, "Health");
    const w = mountHealthView();
    await w.find(".lights-back").trigger("click");
    expect(store.activeSub).toBe(null);
  });
});
