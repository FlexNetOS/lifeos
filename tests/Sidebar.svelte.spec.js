// Svelte counterpart of tests/Sidebar.spec.js — same assertions, same fixture,
// against the Svelte port (src/components/Sidebar.svelte) instead of Sidebar.vue.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import Sidebar from "@/components/Sidebar.svelte";
import { useLifeos } from "@/stores/lifeos-native";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/workspace/:id?", component: { template: "<div />" } },
    { path: "/settings",        component: { template: "<div />" } },
    { path: "/",                redirect: "/workspace/ai" },
  ],
});

describe("Sidebar.svelte", () => {
  let router, pinia;
  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    useLifeos().resetUiState();
    router = makeRouter();
    await router.push("/");
    await router.isReady();
  });

  afterEach(() => cleanup());

  it("renders one rail button per rail entry plus footer entries", () => {
    const { container } = render(Sidebar, { props: { router } });
    const buttons = container.querySelectorAll(".rail-btn");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("clicking the logo toggles the workspace panel via the store", async () => {
    const store = useLifeos();
    const { container } = render(Sidebar, { props: { router } });
    expect(store.wsCollapsed).toBe(false);
    await fireEvent.click(container.querySelector(".rail-brand"));
    expect(store.wsCollapsed).toBe(true);
  });

  it("clicking a rail icon routes to its workspace", async () => {
    const { container } = render(Sidebar, { props: { router } });
    const workBtn = Array.from(container.querySelectorAll(".rail-btn"))
      .find((b) => b.getAttribute("title")?.includes("Work"));
    expect(workBtn).toBeTruthy();
    await fireEvent.click(workBtn);
    await flushPromises();
    expect(router.currentRoute.value.path).toContain("/workspace/work");
  });

  it("clicking the settings icon routes to /settings (NOT a workspace)", async () => {
    const { container } = render(Sidebar, { props: { router } });
    const settingsBtn = Array.from(container.querySelectorAll(".rail-btn"))
      .find((b) => b.getAttribute("title")?.includes("Settings"));
    expect(settingsBtn).toBeTruthy();
    await fireEvent.click(settingsBtn);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/settings");
  });

  it("opens the workspace switcher popover and closes it on Escape", async () => {
    // The popover is teleported (a Svelte action appends it to document.body,
    // mirroring Vue's <Teleport to="body">) — @testing-library/svelte already
    // renders into document.body, so it's reachable directly.
    const { container } = render(Sidebar, { props: { router } });
    await fireEvent.click(container.querySelector(".rail-switcher-trigger"));
    expect(document.body.querySelector(".rail-switcher-menu")).not.toBeNull();
    await fireEvent.keyDown(document, { key: "Escape" });
    await tick();
    expect(document.body.querySelector(".rail-switcher-menu")).toBeNull();
  });
});
