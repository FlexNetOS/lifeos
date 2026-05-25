import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SubsectionView from "@/components/SubsectionView.vue";
import N8nFlowView from "@/components/N8nFlowView.vue";
import { useLifeos } from "@/stores/lifeos.js";

describe("SubsectionView.vue", () => {
  let pinia;
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); });

  it("renders breadcrumb + hero + back button when activeSub is set", () => {
    const store = useLifeos();
    store.pickSub({ icon: "shield", label: "Quiet hours", meta: "After 7 PM" }, "Rules");
    const w = mount(SubsectionView, { global: { plugins: [pinia] } });
    expect(w.find(".sub-back").exists()).toBe(true);
    expect(w.find(".sub-hero h1").text()).toBe("Quiet hours");
    expect(w.text()).toContain("Rules");
  });

  it("clicking 'Dashboard' back button clears the activeSub", async () => {
    const store = useLifeos();
    store.pickSub({ label: "x" }, "Rules");
    const w = mount(SubsectionView, { global: { plugins: [pinia] } });
    await w.find(".sub-back").trigger("click");
    expect(store.activeSub).toBe(null);
  });
});

describe("N8nFlowView.vue", () => {
  let pinia;
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); });

  it("renders an SVG with nodes + edges for a known flow", () => {
    const store = useLifeos();
    store.pickSub({ label: "Day Captain", flowId: "day", view: "n8n-flow", icon: "users-2" }, "Agent Teams");
    const w = mount(N8nFlowView, { global: { plugins: [pinia] } });
    expect(w.find(".flow-canvas").exists()).toBe(true);
    expect(w.find(".flow-svg").exists()).toBe(true);
    expect(w.findAll("path.flow-edge").length).toBe(2);    // 2 edges in fixture
    expect(w.findAll("g.flow-node").length).toBe(3);       // 3 nodes
  });

  it("falls back to SubsectionView when the flow id is unknown", () => {
    const store = useLifeos();
    store.pickSub({ label: "Mystery", flowId: "nope", view: "n8n-flow" }, "Agent Teams");
    const w = mount(N8nFlowView, { global: { plugins: [pinia] } });
    expect(w.find(".flow-canvas").exists()).toBe(false);
    expect(w.find(".sub-hero").exists()).toBe(true);
  });

  it("back button clears activeSub", async () => {
    const store = useLifeos();
    store.pickSub({ label: "Day Captain", flowId: "day", view: "n8n-flow" }, "Agent Teams");
    const w = mount(N8nFlowView, { global: { plugins: [pinia] } });
    await w.find(".sub-back").trigger("click");
    expect(store.activeSub).toBe(null);
  });
});
