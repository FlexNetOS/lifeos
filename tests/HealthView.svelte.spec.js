// Svelte counterpart of tests/HealthView.spec.js — same assertions, same fixture,
// against the Svelte port (src/components/HealthView.svelte) instead of HealthView.vue.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import HealthView from "@/components/HealthView.svelte";
import { useLifeos } from "@/stores/lifeos.js";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/workspace/:id?/:section?/:sub?", component: { template: "<div />" } },
    { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
    { path: "/", redirect: "/workspace/ai" },
  ],
});

describe("HealthView.svelte", () => {
  let pinia, router;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = makeRouter();
    await router.push("/");
    await router.isReady();
  });

  afterEach(() => cleanup());

  const renderHealthView = () => render(HealthView, { props: { router } });

  it("mounts cleanly", () => {
    const { container } = renderHealthView();
    expect(container.querySelector(".health-canvas")).not.toBeNull();
  });

  it("renders 4 metric cards with role='img' and aria-label", () => {
    const { container } = renderHealthView();
    const cards = Array.from(container.querySelectorAll(".health-stat-card"));
    expect(cards.length).toBe(4);
    for (const card of cards) {
      expect(card.getAttribute("role")).toBe("img");
      expect(card.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("sleep chart has 7 bars (one per night)", () => {
    const { container } = renderHealthView();
    // Each bar is a <rect> inside the sleep SVG.
    // We find all rects — each night produces one bar rect.
    const sleepSection = container.querySelector("#sleep-title").closest("section");
    const rects = sleepSection.querySelectorAll("rect");
    expect(rects.length).toBe(7);
  });

  it("activity rings section has 7 SVG groups (one per day)", () => {
    const { container } = renderHealthView();
    const activitySection = container.querySelector("#activity-title").closest("section");
    // Each day renders one .health-activity-day div containing an svg
    const svgs = activitySection.querySelectorAll("svg");
    expect(svgs.length).toBe(7);
  });

  it("heart sparkline polyline path exists", () => {
    const { container } = renderHealthView();
    const heartSection = container.querySelector("#heart-title").closest("section");
    const polyline = heartSection.querySelector("polyline.heart-sparkline-path");
    expect(polyline).not.toBeNull();
    expect(polyline.getAttribute("points")).toBeTruthy();
  });

  it("LifeOS suggests card has role='status' and aria-live='polite'", () => {
    const { container } = renderHealthView();
    const card = container.querySelector('[role="status"][aria-live="polite"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("LifeOS suggests");
  });

  it("back button clears activeSub", async () => {
    const store = useLifeos();
    store.pickSub({ label: "Health", view: "health", icon: "heart-pulse" }, "Health");
    const { container } = renderHealthView();
    await fireEvent.click(container.querySelector(".lights-back"));
    expect(store.activeSub).toBe(null);
  });
});
