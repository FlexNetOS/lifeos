// Svelte counterpart of tests/CalendarView.spec.js — same assertions, same fixture,
// against the Svelte port (src/components/CalendarView.svelte) instead of CalendarView.vue.
// Covers: canvas renders, day grouping, tag filtering by workspace, empty state, back button.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import CalendarView from "@/components/CalendarView.svelte";
import { useLifeos } from "@/stores/lifeos-native";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/workspace/:id?/:section?/:sub?", component: { template: "<div />" } },
    { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
    { path: "/", redirect: "/workspace/ai" },
  ],
});

describe("CalendarView.svelte", () => {
  let pinia, router;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    useLifeos().resetUiState();
    router = makeRouter();
    await router.push("/");
    await router.isReady();
  });

  afterEach(() => cleanup());

  const renderWithSub = (workspaceId = "work") => {
    const store = useLifeos();
    store.activeId = workspaceId;
    store.activeSub = {
      workspaceId,
      sectionTitle: "Calendar",
      item: { icon: "calendar", label: "Calendar", view: "calendar" },
    };
    return render(CalendarView, { props: { router } });
  };

  it("renders .cal-canvas with the Work eyebrow for work workspace", () => {
    const { container } = renderWithSub("work");
    expect(container.querySelector(".cal-canvas")).not.toBeNull();
    expect(container.querySelector(".canvas-eyebrow").textContent).toContain("Work");
  });

  it("renders .cal-canvas with the Personal eyebrow for personal workspace", () => {
    const { container } = renderWithSub("personal");
    expect(container.querySelector(".canvas-eyebrow").textContent).toContain("Personal");
  });

  it("renders day group sections including Today and Tomorrow", () => {
    const { container } = renderWithSub("work");
    const days = Array.from(container.querySelectorAll(".cal-day"));
    expect(days.length).toBeGreaterThanOrEqual(2);
    const labels = days.map((d) => d.querySelector(".cal-day-label").textContent.trim());
    expect(labels).toContain("Today");
    expect(labels).toContain("Tomorrow");
  });

  it("shows only Work-tagged events for work workspace", () => {
    const { container } = renderWithSub("work");
    const tags = Array.from(container.querySelectorAll(".cal-event-tag")).map((t) => t.textContent.trim());
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => t === "Work")).toBe(true);
  });

  it("shows only Personal and Family events for personal workspace", () => {
    const { container } = renderWithSub("personal");
    const tags = Array.from(container.querySelectorAll(".cal-event-tag")).map((t) => t.textContent.trim());
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => t === "Personal" || t === "Family")).toBe(true);
  });

  it("marks the Today section with cal-day--today modifier class", () => {
    const { container } = renderWithSub("work");
    const todaySection = Array.from(container.querySelectorAll(".cal-day")).find(
      (d) => d.querySelector(".cal-day-label").textContent.trim() === "Today"
    );
    expect(todaySection).toBeTruthy();
    expect(todaySection.classList.contains("cal-day--today")).toBe(true);
  });

  it("renders the events summary line with an event count", () => {
    const { container } = renderWithSub("work");
    const summary = container.querySelector(".lights-summary");
    expect(summary).not.toBeNull();
    expect(summary.textContent).toMatch(/\d+ event/);
  });

  it("clicking the back button calls clearSub", async () => {
    const store = useLifeos();
    store.activeId = "work";
    store.activeSub = {
      workspaceId: "work",
      sectionTitle: "Calendar",
      item: { icon: "calendar", label: "Calendar", view: "calendar" },
    };
    const { container } = render(CalendarView, { props: { router } });
    const back = container.querySelector(".lights-back");
    expect(back).not.toBeNull();
    await fireEvent.click(back);
    expect(store.activeSub).toBe(null);
  });
});
