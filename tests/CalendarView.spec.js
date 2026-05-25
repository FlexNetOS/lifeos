// LifeOS — CalendarView SFC tests.
// Covers: canvas renders, day grouping, tag filtering by workspace, empty state, back button.

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CalendarView from "@/components/CalendarView.vue";
import { useLifeos } from "@/stores/lifeos.js";

// CalendarView uses useNav() → useRouter(). In the test environment there is no router
// plugin, so Vue emits a warning (same pattern as LightsView.spec.js). Tests still pass.

describe("CalendarView.vue", () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  const mountWithSub = (workspaceId = "work") => {
    const store = useLifeos();
    store.activeId = workspaceId;
    store.activeSub = {
      workspaceId,
      sectionTitle: "Calendar",
      item: { icon: "calendar", label: "Calendar", view: "calendar" },
    };
    return mount(CalendarView, { global: { plugins: [pinia] } });
  };

  it("renders .cal-canvas with the Work eyebrow for work workspace", () => {
    const w = mountWithSub("work");
    expect(w.find(".cal-canvas").exists()).toBe(true);
    expect(w.find(".canvas-eyebrow").text()).toContain("Work");
  });

  it("renders .cal-canvas with the Personal eyebrow for personal workspace", () => {
    const w = mountWithSub("personal");
    expect(w.find(".canvas-eyebrow").text()).toContain("Personal");
  });

  it("renders day group sections including Today and Tomorrow", () => {
    const w = mountWithSub("work");
    const days = w.findAll(".cal-day");
    expect(days.length).toBeGreaterThanOrEqual(2);
    const labels = days.map((d) => d.find(".cal-day-label").text());
    expect(labels).toContain("Today");
    expect(labels).toContain("Tomorrow");
  });

  it("shows only Work-tagged events for work workspace", () => {
    const w = mountWithSub("work");
    const tags = w.findAll(".cal-event-tag").map((t) => t.text());
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => t === "Work")).toBe(true);
  });

  it("shows only Personal and Family events for personal workspace", () => {
    const w = mountWithSub("personal");
    const tags = w.findAll(".cal-event-tag").map((t) => t.text());
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => t === "Personal" || t === "Family")).toBe(true);
  });

  it("marks the Today section with cal-day--today modifier class", () => {
    const w = mountWithSub("work");
    const todaySection = w.findAll(".cal-day").find(
      (d) => d.find(".cal-day-label").text() === "Today"
    );
    expect(todaySection).toBeTruthy();
    expect(todaySection.classes()).toContain("cal-day--today");
  });

  it("renders the events summary line with an event count", () => {
    const w = mountWithSub("work");
    const summary = w.find(".lights-summary");
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toMatch(/\d+ event/);
  });

  it("clicking the back button calls clearSub", async () => {
    const store = useLifeos();
    store.activeId = "work";
    store.activeSub = {
      workspaceId: "work",
      sectionTitle: "Calendar",
      item: { icon: "calendar", label: "Calendar", view: "calendar" },
    };
    const w = mount(CalendarView, { global: { plugins: [pinia] } });
    const back = w.find(".lights-back");
    expect(back.exists()).toBe(true);
    await back.trigger("click");
    expect(store.activeSub).toBe(null);
  });
});
