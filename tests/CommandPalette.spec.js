// LifeOS — CommandPalette SFC tests (Phase 4 #2).
// The palette uses <Teleport to="body"> so all DOM queries hit document.body.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import CommandPalette from "@/components/CommandPalette.vue";
import { useLifeos } from "@/stores/lifeos.js";

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", redirect: "/workspace/ai" },
      { path: "/workspace/:id/:section?/:sub?", component: { template: "<div />" } },
      { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
    ],
  });

describe("CommandPalette.vue", () => {
  let pinia, router, w;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = makeRouter();
    await router.push("/workspace/ai");
    await router.isReady();
    w = mount(CommandPalette, { attachTo: document.body, global: { plugins: [pinia, router] } });
  });

  afterEach(() => {
    w?.unmount();
    document.body.innerHTML = "";
  });

  it("renders nothing while cmdkOpen is false", () => {
    expect(document.body.querySelector(".cmdk-overlay")).toBeNull();
  });

  it("renders the overlay when openCmdk() is called", async () => {
    const store = useLifeos();
    store.openCmdk("");
    await flushPromises();
    expect(document.body.querySelector(".cmdk-overlay")).not.toBeNull();
  });

  it("indexes workspaces from window.LIFEOS_DATA when opened with no query", async () => {
    const store = useLifeos();
    store.openCmdk("");
    await flushPromises();
    const rows = Array.from(document.body.querySelectorAll(".cmdk-row"));
    // Fixture has 3 workspace rail ids + 2 footer + at least one team
    expect(rows.length).toBeGreaterThan(2);
  });

  it("filters results when the user types a query", async () => {
    const store = useLifeos();
    store.openCmdk("");
    await flushPromises();
    const input = document.body.querySelector(".cmdk-input-wrap input");
    input.value = "home";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    const labels = Array.from(document.body.querySelectorAll(".cmdk-label")).map((l) => l.textContent);
    expect(labels.join("|").toLowerCase()).toContain("home");
  });

  it("Escape on the input closes the palette", async () => {
    const store = useLifeos();
    store.openCmdk("");
    await flushPromises();
    expect(store.cmdkOpen).toBe(true);
    const input = document.body.querySelector(".cmdk-input-wrap input");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(store.cmdkOpen).toBe(false);
  });

  it("clicking a workspace row routes via useNav (URL updates)", async () => {
    const store = useLifeos();
    store.openCmdk("");
    await flushPromises();
    const homeRow = Array.from(document.body.querySelectorAll(".cmdk-row")).find(
      (b) => b.querySelector(".cmdk-label")?.textContent?.includes("Home"),
    );
    expect(homeRow).toBeTruthy();
    homeRow.click();
    await flushPromises();
    expect(store.cmdkOpen).toBe(false);
    expect(store.activeId).toBe("home");
    expect(router.currentRoute.value.path).toContain("/workspace/home");
  });

  it("openCmdk accepts a seed query for pre-filtering", async () => {
    const store = useLifeos();
    store.openCmdk("home");
    await flushPromises();
    const input = document.body.querySelector(".cmdk-input-wrap input");
    expect(input.value).toBe("home");
  });
});
