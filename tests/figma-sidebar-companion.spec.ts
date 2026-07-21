import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Sidebar from "@/components/Sidebar.vue";
import Workspace from "@/components/Workspace.vue";
import CommandPalette from "@/components/CommandPalette.vue";
import NotificationsDrawer from "@/components/NotificationsDrawer.vue";
import { useLifeos } from "@/stores/lifeos.js";

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(resolve(root, "design-system-reference/figma/sidebar-design-system-companion.json"), "utf8")
);

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", redirect: "/workspace/ai" },
      { path: "/workspace/:id/:section?/:sub?", component: { template: "<div />" } },
      { path: "/settings/:section?/:sub?", component: { template: "<div />" } }
    ]
  });

describe("authenticated Figma Sidebar Design System Companion connection", () => {
  let wrappers: VueWrapper[] = [];

  beforeEach(() => {
    document.body.innerHTML = "";
    wrappers = [];
  });

  afterEach(() => {
    for (const wrapper of wrappers) wrapper.unmount();
    document.body.innerHTML = "";
  });

  it("pins the exact input and keeps observed document facts distinct from descriptive copy", () => {
    expect(manifest.design_input.url).toBe(
      "https://www.figma.com/design/z7aJ8uZrOsvfnWlsApN0Bu/Sidebar-Design-System-Companion?node-id=0-1&m=dev"
    );
    expect(manifest.connector_receipt.access).toBe("verified");
    expect(manifest.connector_receipt.page_inventory.actual_pages).toEqual([
      { node_id: "0:1", name: "00 — Overview + Tokens" }
    ]);
    expect(manifest.connector_receipt.page_inventory.descriptive_text_only_not_actual_pages).toHaveLength(2);
    expect(manifest.connector_receipt.hierarchy.node_counts).toMatchObject({
      total_named: 80,
      component: 0,
      component_set: 0,
      instance: 0
    });
    expect(manifest.connector_receipt.variables.observed).toEqual({});
  });

  it("classifies every observed token and forbids copied/manual Figma authority", () => {
    expect(manifest.observed_design_tokens.colors).toHaveLength(13);
    expect(new Set(manifest.observed_design_tokens.colors.map(({ node_id }) => node_id)).size).toBe(13);
    expect(manifest.authority_guards.no_copied_or_manual_design_authority).toBe(true);
    expect(manifest.authority_guards.no_stale_screenshot_authority).toBe(true);
    expect(manifest.connector_receipt.design_context.generated_reference_stack).toContain("never imported");
  });

  it("keeps every semantic mapping anchored to checked source and existing proof files", () => {
    for (const mapping of manifest.component_mappings) {
      expect(mapping.figma_reference_node).toBe("5:49");
      expect(mapping.figma_component_node).toBeNull();
      const source = resolve(root, mapping.source);
      expect(existsSync(source), mapping.source).toBe(true);
      expect(readFileSync(source, "utf8"), mapping.source).toContain(mapping.source_anchor);
      for (const proof of [...mapping.accessibility, mapping.regression]) {
        expect(existsSync(resolve(root, proof)), proof).toBe(true);
      }
    }
  });

  it("renders all four mapped command-spine concepts with exact reference anchors", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = makeRouter();
    await router.push("/workspace/ai");
    await router.isReady();
    const global = { plugins: [pinia, router] };

    const sidebar = mount(Sidebar, { global });
    const workspace = mount(Workspace, { global });
    const commandPalette = mount(CommandPalette, { attachTo: document.body, global });
    const notifications = mount(NotificationsDrawer, { attachTo: document.body, global });
    wrappers.push(sidebar, workspace, commandPalette, notifications);

    const store = useLifeos();
    store.openCmdk("");
    store.openNotificationsDrawer();
    await flushPromises();

    expect(sidebar.get("[data-figma-reference='5:49#icon-rail']").exists()).toBe(true);
    expect(workspace.get("[data-figma-reference='5:49#detail-panel']").exists()).toBe(true);
    expect(document.body.querySelector("[data-figma-reference='5:49#command-menu']")).not.toBeNull();
    expect(document.body.querySelector("[data-figma-reference='5:49#temporary-panels']")).not.toBeNull();
  });
});
