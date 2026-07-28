// Svelte counterpart of tests/App-auth-gate.spec.js — same assertions, same
// fixture, against the Svelte port (src/App.svelte) instead of App.vue.
//
// Also covers what App-auth-gate.spec.js doesn't: the <main> view-pane gate
// (including the OpenPencil mounting gate) that CLAUDE.md/AGENTS.md require
// App.svelte to preserve exactly. Phase 2 replaced the phase-1 placeholders
// with the real ported components, so the gate tests now assert the actual
// view roots (.canvas-greeting for Dashboard, .op-canvas for the editor,
// .sub-canvas for SubsectionView, .ai-avatar for the overlay).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import App from "@/App.svelte";
import { useAuth } from "@/stores/auth";
import { useLifeos } from "@/stores/lifeos-native";

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/workspace/:id?/:section?/:sub?", component: { template: "<div />" } },
      { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
      { path: "/", redirect: "/workspace/ai" },
    ],
  });

describe("App.svelte auth gate", () => {
  let pinia, router, auth;
  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    useLifeos().resetUiState();
    router = makeRouter();
    await router.push("/");
    await router.isReady();
    auth = useAuth();
    auth._resetFakeBackend();
  });

  afterEach(() => cleanup());

  it("renders Login when no account exists (needs_signup)", async () => {
    await auth.loadStatus();
    const { container } = render(App, { props: { router } });
    await tick();
    expect(container.querySelector(".lifeos-login")).not.toBeNull();
    expect(container.querySelector(".shell")).toBeNull();
  });

  it("renders the shell when signed_in", async () => {
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
    const { container } = render(App, { props: { router } });
    await tick();
    expect(container.querySelector(".shell")).not.toBeNull();
    expect(container.querySelector(".lifeos-login")).toBeNull();
  });

  it("reverts to Login after signout", async () => {
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
    const { container } = render(App, { props: { router } });
    await tick();
    expect(container.querySelector(".shell")).not.toBeNull();

    await auth.signout();
    await tick();
    expect(container.querySelector(".lifeos-login")).not.toBeNull();
    expect(container.querySelector(".shell")).toBeNull();
  });

  it("renders Login when signed_out (welcome back)", async () => {
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
    await auth.signout();
    const { container } = render(App, { props: { router } });
    await tick();
    expect(container.querySelector(".lifeos-login")).not.toBeNull();
    expect(container.textContent).toContain("Welcome back");
  });
});

describe("App.svelte shell layout + main-pane gate", () => {
  let pinia, router, auth, lifeos;
  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    useLifeos().resetUiState();
    router = makeRouter();
    await router.push("/");
    await router.isReady();
    auth = useAuth();
    auth._resetFakeBackend();
    lifeos = useLifeos();
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
  });

  afterEach(() => cleanup());

  it("hydrates the current redb owner projection before waiting for events", async () => {
    const originalTauri = window.__TAURI__;
    const calls = [];
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          calls.push([command, args]);
          if (command === "redb_projection_read") {
            return { localSeq: 7, checksum: "abc", degraded: false, entries: {} };
          }
          if (command === "redb_state_write") return 8;
          if (command === "redb_events_read") return [];
          if (command === "redb_swarm_heartbeat") return 8;
          if (command === "redb_ui_ready") return 9;
          throw new Error(`unexpected command: ${command}`);
        },
      },
    };

    try {
      render(App, { props: { router } });
      await tick();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const projectionIndex = calls.findIndex(([command]) => command === "redb_projection_read");
      const eventIndex = calls.findIndex(([command]) => command === "redb_events_read");
      expect(projectionIndex).toBeGreaterThanOrEqual(0);
      expect(eventIndex).toBeGreaterThan(projectionIndex);
      expect(calls[eventIndex]).toEqual(["redb_events_read", { afterSeq: 7 }]);
      expect(calls).toContainEqual([
        "redb_state_write",
        expect.objectContaining({ key: "glass.ui.ready" }),
      ]);
    } finally {
      window.__TAURI__ = originalTauri;
    }
  });

  it("mounts Sidebar | Workspace | main | AIAvatar in one shell", async () => {
    const { container } = render(App, { props: { router } });
    await tick();
    expect(container.querySelector(".shell .rail")).not.toBeNull();
    expect(container.querySelector(".shell .workspace")).not.toBeNull();
    expect(container.querySelector(".shell #main.main")).not.toBeNull();
    expect(container.querySelector(".shell .ai-avatar")).not.toBeNull();
  });

  it("mounts the Dashboard when no activeSub is set", async () => {
    lifeos.activeSub = null;
    const { container } = render(App, { props: { router } });
    await tick();
    expect(container.querySelector("#main .canvas-greeting")).not.toBeNull();
  });

  it("preserves the OpenPencil mounting gate: activeSub.item?.view === 'open-pencil'", async () => {
    lifeos.activeSub = { workspaceId: "ai", sectionTitle: "Files", item: { label: "App.vue", view: "open-pencil" } };
    const { container } = render(App, { props: { router } });
    await tick();
    expect(container.querySelector("#main .op-canvas")).not.toBeNull();
    expect(container.querySelector("#main .sub-canvas")).toBeNull();
  });

  it("falls through to SubsectionView for an unrecognized/absent view discriminator", async () => {
    lifeos.activeSub = { workspaceId: "ai", sectionTitle: "Rules", item: { label: "Quiet hours" } };
    const { container } = render(App, { props: { router } });
    await tick();
    expect(container.querySelector("#main .sub-canvas")).not.toBeNull();
    expect(container.querySelector("#main .op-canvas")).toBeNull();
  });

  it("mounts the N8nFlowView for view === 'n8n-flow'", async () => {
    lifeos.activeSub = { workspaceId: "ai", sectionTitle: "Agent Teams", item: { label: "Day Captain", flowId: "day", view: "n8n-flow" } };
    const { container } = render(App, { props: { router } });
    await tick();
    expect(container.querySelector("#main .flow-canvas")).not.toBeNull();
  });

  it("mounts SettingsView when activeId is settings with no activeSub", async () => {
    lifeos.activeId = "settings";
    lifeos.activeSub = null;
    const { container } = render(App, { props: { router } });
    await tick();
    expect(container.querySelector("#main .settings-canvas")).not.toBeNull();
    expect(container.querySelector("#main .canvas-greeting")).toBeNull();
  });
});
