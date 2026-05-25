// LifeOS — useNav() composable
// Covers the deep-linking gap fixed in Phase 4 #1.
// pickSection / pickSub / jumpToTeam now push to vue-router in addition to mutating Pinia.

import { defineComponent, h } from "vue";
import { describe, it, expect, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { buildPath, useNav } from "@/lib/nav.js";
import { useLifeos } from "@/stores/lifeos.js";

const Harness = defineComponent({
  setup() {
    const lifeos = useLifeos();
    const nav = useNav();
    return { lifeos, nav };
  },
  render() {
    return h("div");
  },
});

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", redirect: "/workspace/ai" },
      { path: "/workspace/:id/:section?/:sub?", component: { template: "<div />" } },
      { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
    ],
  });

describe("buildPath", () => {
  it("workspace + section + sub", () => {
    expect(buildPath("ai", "Agent Teams", "Day Captain"))
      .toBe("/workspace/ai/Agent%20Teams/Day%20Captain");
  });
  it("settings", () => {
    expect(buildPath("settings", "Profile")).toBe("/settings/Profile");
  });
  it("workspace only", () => {
    expect(buildPath("work")).toBe("/workspace/work");
  });
  it("encodes punctuation in titles", () => {
    expect(buildPath("ai", "Q&A!", "What's up?"))
      .toBe("/workspace/ai/Q%26A!/What's%20up%3F");
  });
});

describe("useNav()", () => {
  let pinia, router, wrapper;
  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = makeRouter();
    await router.push("/workspace/ai");
    await router.isReady();
    wrapper = mount(Harness, { global: { plugins: [pinia, router] } });
  });

  it("pickWorkspace updates the store AND the URL", async () => {
    wrapper.vm.nav.pickWorkspace("work");
    await flushPromises();
    expect(wrapper.vm.lifeos.activeId).toBe("work");
    expect(router.currentRoute.value.path).toBe("/workspace/work");
  });

  it("pickWorkspace('settings') routes to /settings, not /workspace/settings", async () => {
    wrapper.vm.nav.pickWorkspace("settings");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/settings");
  });

  it("pickSection updates URL with section segment", async () => {
    wrapper.vm.nav.pickSection("Agent Teams");
    await flushPromises();
    expect(wrapper.vm.lifeos.sectionByWs.ai).toBe("Agent Teams");
    expect(router.currentRoute.value.path).toBe("/workspace/ai/Agent%20Teams");
  });

  it("pickSub updates URL with section + sub segments", async () => {
    wrapper.vm.lifeos.sectionByWs.ai = "Rules";
    wrapper.vm.nav.pickSub({ label: "Quiet hours" }, "Rules");
    await flushPromises();
    expect(wrapper.vm.lifeos.activeSub?.item?.label).toBe("Quiet hours");
    expect(router.currentRoute.value.path).toBe("/workspace/ai/Rules/Quiet%20hours");
  });

  it("clearSub routes back to the section URL", async () => {
    wrapper.vm.lifeos.sectionByWs.ai = "Rules";
    wrapper.vm.nav.pickSub({ label: "Quiet hours" }, "Rules");
    await flushPromises();
    wrapper.vm.nav.clearSub();
    await flushPromises();
    expect(wrapper.vm.lifeos.activeSub).toBe(null);
    expect(router.currentRoute.value.path).toBe("/workspace/ai/Rules");
  });

  it("jumpToTeam jumps to /workspace/ai/Agent Teams/<team>", async () => {
    await router.push("/workspace/work");  // start elsewhere
    await flushPromises();
    wrapper.vm.nav.jumpToTeam({ label: "Day Captain" }, 0);
    await flushPromises();
    expect(wrapper.vm.lifeos.activeId).toBe("ai");
    expect(wrapper.vm.lifeos.sectionByWs.ai).toBe("Agent Teams");
    expect(router.currentRoute.value.path).toBe("/workspace/ai/Agent%20Teams/Day%20Captain");
  });

  it("does not re-push when target URL already matches (no infinite loop)", async () => {
    const pushed = [];
    const origPush = router.push.bind(router);
    router.push = (...args) => { pushed.push(args[0]); return origPush(...args); };
    // Pre-position the URL exactly where pickWorkspace would push.
    await origPush("/workspace/work");
    await flushPromises();
    pushed.length = 0;
    wrapper.vm.nav.pickWorkspace("work");
    await flushPromises();
    expect(pushed).toEqual([]);  // no router.push call because path matched
  });
});
