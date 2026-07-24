// Svelte counterpart of tests/SubsectionAndFlow.spec.js — same assertions
// against the Svelte ports (SubsectionView.svelte / N8nFlowView.svelte).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import SubsectionView from "@/components/SubsectionView.svelte";
import N8nFlowView from "@/components/N8nFlowView.svelte";
import { useLifeos } from "@/stores/lifeos.js";

describe("SubsectionView.svelte", () => {
  let pinia;
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); });
  afterEach(() => cleanup());

  it("renders breadcrumb + hero + back button when activeSub is set", () => {
    const store = useLifeos();
    store.pickSub({ icon: "shield", label: "Quiet hours", meta: "After 7 PM" }, "Rules");
    const { container } = render(SubsectionView);
    expect(container.querySelector(".sub-back")).not.toBeNull();
    expect(container.querySelector(".sub-hero h1").textContent).toBe("Quiet hours");
    expect(container.textContent).toContain("Rules");
  });

  it("clicking 'Dashboard' back button clears the activeSub", async () => {
    const store = useLifeos();
    store.pickSub({ label: "x" }, "Rules");
    const { container } = render(SubsectionView);
    await fireEvent.click(container.querySelector(".sub-back"));
    expect(store.activeSub).toBe(null);
  });
});

describe("N8nFlowView.svelte", () => {
  let pinia;
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia); });
  afterEach(() => cleanup());

  it("renders an SVG with nodes + edges for a known flow", () => {
    const store = useLifeos();
    store.pickSub({ label: "Day Captain", flowId: "day", view: "n8n-flow", icon: "users-2" }, "Agent Teams");
    const { container } = render(N8nFlowView);
    expect(container.querySelector(".flow-canvas")).not.toBeNull();
    expect(container.querySelector(".flow-svg")).not.toBeNull();
    expect(container.querySelectorAll("path.flow-edge").length).toBe(2);    // 2 edges in fixture
    expect(container.querySelectorAll("g.flow-node").length).toBe(3);       // 3 nodes
  });

  it("falls back to SubsectionView when the flow id is unknown", () => {
    const store = useLifeos();
    store.pickSub({ label: "Mystery", flowId: "nope", view: "n8n-flow" }, "Agent Teams");
    const { container } = render(N8nFlowView);
    expect(container.querySelector(".flow-canvas")).toBeNull();
    expect(container.querySelector(".sub-hero")).not.toBeNull();
  });

  it("back button clears activeSub", async () => {
    const store = useLifeos();
    store.pickSub({ label: "Day Captain", flowId: "day", view: "n8n-flow" }, "Agent Teams");
    const { container } = render(N8nFlowView);
    await fireEvent.click(container.querySelector(".sub-back"));
    expect(store.activeSub).toBe(null);
  });
});
