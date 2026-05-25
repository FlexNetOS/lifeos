import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import Dashboard from "@/components/Dashboard.vue";
import { useLifeos } from "@/stores/lifeos.js";

describe("Dashboard.vue", () => {
  let pinia;
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); });

  it("renders greeting + stat cards + agent team grid", () => {
    const w = mount(Dashboard, { global: { plugins: [pinia] } });
    expect(w.find(".canvas-greeting").text()).toBe("Good afternoon.");
    expect(w.findAll(".stat-card").length).toBe(1);
    expect(w.findAll(".team-card").length).toBe(1);
  });

  it("clicking an agent team card jumps to AI workspace + opens the flow", async () => {
    const store = useLifeos();
    const w = mount(Dashboard, { global: { plugins: [pinia] } });
    await w.find(".team-card").trigger("click");
    expect(store.activeId).toBe("ai");
    expect(store.sectionByWs.ai).toBe("Agent Teams");
    expect(store.activeSub?.item?.flowId).toBe("day");
  });

  it("dragging one team onto another updates the store order", async () => {
    const store = useLifeos();
    // Seed with 2 teams for a meaningful reorder
    window.LIFEOS_DATA.dashboardCanvas.teams = [
      { id: "a", icon: "calendar", name: "A", status: "online", meta: "", counter: "", tone: "cyan", flowId: "day" },
      { id: "b", icon: "inbox",    name: "B", status: "online", meta: "", counter: "", tone: "purple", flowId: "day" },
    ];
    const w = mount(Dashboard, { global: { plugins: [pinia] } });
    const cards = w.findAll(".team-card");
    expect(cards.length).toBe(2);

    const dt = { effectAllowed: null, dropEffect: null, setData() {}, getData: () => "a" };
    await cards[0].trigger("dragstart", { dataTransfer: dt });
    await cards[1].trigger("dragover",  { dataTransfer: dt });
    await cards[1].trigger("drop",       { dataTransfer: dt });

    expect(store.teamOrder).toEqual(["b", "a"]);
  });
});
