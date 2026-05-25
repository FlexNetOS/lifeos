import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import Workspace from "@/components/Workspace.vue";
import { useLifeos } from "@/stores/lifeos.js";

describe("Workspace.vue", () => {
  let pinia;
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); });

  it("renders the active workspace title + first section by default", () => {
    const w = mount(Workspace, { global: { plugins: [pinia] } });
    expect(w.text()).toContain("AI Command Center");
    expect(w.text()).toContain("Rules");
  });

  it("opens the section selector on header click and closes on Escape", async () => {
    const w = mount(Workspace, { global: { plugins: [pinia] } });
    await w.find(".ws-selector-trigger").trigger("click");
    expect(w.find(".ws-selector-menu").exists()).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await w.vm.$nextTick();
    expect(w.find(".ws-selector-menu").exists()).toBe(false);
  });

  it("picks a section when an option is clicked", async () => {
    const store = useLifeos();
    const w = mount(Workspace, { global: { plugins: [pinia] } });
    await w.find(".ws-selector-trigger").trigger("click");
    const teamsOption = w.findAll(".ws-selector-option").find(b => b.text().includes("Agent Teams"));
    await teamsOption.trigger("click");
    expect(store.sectionByWs.ai).toBe("Agent Teams");
  });

  it("clicking a MenuRow sets activeSub on the store", async () => {
    const store = useLifeos();
    const w = mount(Workspace, { global: { plugins: [pinia] } });
    await w.find(".menu-row").trigger("click");
    expect(store.activeSub).toBeTruthy();
    expect(store.activeSub.sectionTitle).toBe("Rules");
  });

  it("renders the mini-workspace when wsCollapsed is true", async () => {
    const store = useLifeos();
    store.toggleWs();
    const w = mount(Workspace, { global: { plugins: [pinia] } });
    expect(w.find(".workspace.mini").exists()).toBe(true);
    expect(w.find(".mini-id").exists()).toBe(true);
  });

  it("clicking the mini-id reopens the panel", async () => {
    const store = useLifeos();
    store.toggleWs();
    const w = mount(Workspace, { global: { plugins: [pinia] } });
    await w.find(".mini-id").trigger("click");
    expect(store.wsCollapsed).toBe(false);
  });

  it("close-panel button (ws-collapse) collapses the panel", async () => {
    const store = useLifeos();
    const w = mount(Workspace, { global: { plugins: [pinia] } });
    await w.find(".ws-collapse").trigger("click");
    expect(store.wsCollapsed).toBe(true);
  });
});
