import { describe, it, expect, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import Sidebar from "@/components/Sidebar.vue";
import { useLifeos } from "@/stores/lifeos.js";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/workspace/:id?", component: { template: "<div />" } },
    { path: "/settings",        component: { template: "<div />" } },
    { path: "/",                redirect: "/workspace/ai" },
  ],
});

describe("Sidebar.vue", () => {
  let router, pinia;
  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = makeRouter();
    await router.push("/");
    await router.isReady();
  });

  it("renders one rail button per rail entry plus footer entries", () => {
    const w = mount(Sidebar, { global: { plugins: [pinia, router] } });
    const buttons = w.findAll(".rail-btn");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("clicking the logo toggles the workspace panel via the store", async () => {
    const store = useLifeos();
    const w = mount(Sidebar, { global: { plugins: [pinia, router] } });
    expect(store.wsCollapsed).toBe(false);
    await w.find(".rail-brand").trigger("click");
    expect(store.wsCollapsed).toBe(true);
  });

  it("clicking a rail icon routes to its workspace", async () => {
    const w = mount(Sidebar, { global: { plugins: [pinia, router] } });
    const workBtn = w.findAll(".rail-btn").find(b => b.attributes("title")?.includes("Work"));
    expect(workBtn).toBeTruthy();
    await workBtn.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toContain("/workspace/work");
  });

  it("clicking the settings icon routes to /settings (NOT a workspace)", async () => {
    const w = mount(Sidebar, { global: { plugins: [pinia, router] } });
    const settingsBtn = w.findAll(".rail-btn").find(b => b.attributes("title")?.includes("Settings"));
    expect(settingsBtn).toBeTruthy();
    await settingsBtn.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/settings");
  });

  it("opens the workspace switcher popover and closes it on Escape", async () => {
    // The popover uses <Teleport to="body">, so it renders into document.body
    // and is OUTSIDE the mount wrapper's subtree. Query document.body directly.
    const w = mount(Sidebar, { attachTo: document.body, global: { plugins: [pinia, router] } });
    await w.find(".rail-switcher-trigger").trigger("click");
    expect(document.body.querySelector(".rail-switcher-menu")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await w.vm.$nextTick();
    expect(document.body.querySelector(".rail-switcher-menu")).toBeNull();
    w.unmount();
  });
});
