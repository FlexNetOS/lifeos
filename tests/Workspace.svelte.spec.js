// Svelte counterpart of tests/Workspace.spec.js — same assertions, same fixture,
// against the Svelte port (src/components/Workspace.svelte) instead of Workspace.vue.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import Workspace from "@/components/Workspace.svelte";
import { useLifeos } from "@/stores/lifeos-native";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/workspace/:id?/:section?/:sub?", component: { template: "<div />" } },
    { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
    { path: "/", redirect: "/workspace/ai" },
  ],
});

describe("Workspace.svelte", () => {
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

  it("renders the active workspace title + first section by default", () => {
    const { container } = render(Workspace, { props: { router } });
    expect(container.textContent).toContain("AI Command Center");
    expect(container.textContent).toContain("Rules");
  });

  it("opens the section selector on header click and closes on Escape", async () => {
    const { container } = render(Workspace, { props: { router } });
    await fireEvent.click(container.querySelector(".ws-selector-trigger"));
    expect(container.querySelector(".ws-selector-menu")).not.toBeNull();
    await fireEvent.keyDown(document, { key: "Escape" });
    await tick();
    expect(container.querySelector(".ws-selector-menu")).toBeNull();
  });

  it("picks a section when an option is clicked", async () => {
    const store = useLifeos();
    const { container } = render(Workspace, { props: { router } });
    await fireEvent.click(container.querySelector(".ws-selector-trigger"));
    const teamsOption = Array.from(container.querySelectorAll(".ws-selector-option"))
      .find((b) => b.textContent.includes("Agent Teams"));
    expect(teamsOption).toBeTruthy();
    await fireEvent.click(teamsOption);
    expect(store.sectionByWs.ai).toBe("Agent Teams");
  });

  it("clicking a MenuRow sets activeSub on the store", async () => {
    const store = useLifeos();
    const { container } = render(Workspace, { props: { router } });
    await fireEvent.click(container.querySelector(".menu-row"));
    expect(store.activeSub).toBeTruthy();
    expect(store.activeSub.sectionTitle).toBe("Rules");
  });

  it("renders the mini-workspace when wsCollapsed is true", () => {
    const store = useLifeos();
    store.toggleWs();
    const { container } = render(Workspace, { props: { router } });
    expect(container.querySelector(".workspace.mini")).not.toBeNull();
    expect(container.querySelector(".mini-id")).not.toBeNull();
  });

  it("clicking the mini-id reopens the panel", async () => {
    const store = useLifeos();
    store.toggleWs();
    const { container } = render(Workspace, { props: { router } });
    await fireEvent.click(container.querySelector(".mini-id"));
    expect(store.wsCollapsed).toBe(false);
  });

  it("close-panel button (ws-collapse) collapses the panel", async () => {
    const store = useLifeos();
    const { container } = render(Workspace, { props: { router } });
    await fireEvent.click(container.querySelector(".ws-collapse"));
    expect(store.wsCollapsed).toBe(true);
  });
});
