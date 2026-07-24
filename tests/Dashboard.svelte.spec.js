// Svelte counterpart of tests/Dashboard.spec.js — same assertions against the
// Svelte port (src/components/Dashboard.svelte).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import Dashboard from "@/components/Dashboard.svelte";
import { useLifeos } from "@/stores/lifeos.js";
import { useAuth } from "@/stores/auth";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/workspace/:id?/:section?/:sub?", component: { template: "<div />" } },
    { path: "/", redirect: "/workspace/ai" },
  ],
});

describe("Dashboard.svelte", () => {
  let pinia, router;
  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = makeRouter();
    await router.push("/");
    await router.isReady();
  });

  afterEach(() => cleanup());

  it("renders greeting + stat cards + agent team grid", () => {
    const { container } = render(Dashboard, { props: { router } });
    expect(container.querySelector(".canvas-greeting").textContent).toBe("Good afternoon.");
    expect(container.querySelectorAll(".stat-card").length).toBe(1);
    expect(container.querySelectorAll(".team-card").length).toBe(1);
  });

  it("personalizes the greeting from the signed-in account", async () => {
    const auth = useAuth();
    auth._resetFakeBackend();
    await auth.signup({ email: "drdave@local.lifeos", displayName: "DrDave", password: "longenough" });

    const { container } = render(Dashboard, { props: { router } });

    expect(container.querySelector(".canvas-greeting").textContent).toBe("Good afternoon, DrDave.");
  });

  it("clicking an agent team card jumps to AI workspace + opens the flow", async () => {
    const store = useLifeos();
    const { container } = render(Dashboard, { props: { router } });
    await fireEvent.click(container.querySelector(".team-card"));
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
    const { container } = render(Dashboard, { props: { router } });
    const cards = container.querySelectorAll(".team-card");
    expect(cards.length).toBe(2);

    const dt = { effectAllowed: null, dropEffect: null, setData() {}, getData: () => "a" };
    await fireEvent.dragStart(cards[0], { dataTransfer: dt });
    await fireEvent.dragOver(cards[1],  { dataTransfer: dt });
    await fireEvent.drop(cards[1],       { dataTransfer: dt });

    expect(store.teamOrder).toEqual(["b", "a"]);
  });
});
