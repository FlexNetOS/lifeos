import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import Sidebar from "@/components/Sidebar.vue";
import Workspace from "@/components/Workspace.vue";
import MenuRow from "@/components/MenuRow.vue";

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(resolve(root, "design-system-reference/figma/sidebar-design-system-companion.json"), "utf8")
);

const router = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }]
  });

describe("Figma Sidebar Design System Companion connection", () => {
  it("pins the exact authorized design input and rejects screenshot authority", () => {
    expect(manifest.design_input.file_key).toBe("z7aJ8uZrOsvfnWlsApN0Bu");
    expect(manifest.design_input.node_id).toBe("0:1");
    expect(manifest.authority_guards.no_stale_screenshot_authority).toBe(true);
    expect(manifest.connector_receipt.code_connect.status).toBe("seat_gated");
  });

  it("keeps every source mapping anchored in checked-in Vue source", () => {
    for (const mapping of manifest.component_mappings) {
      const source = resolve(root, mapping.source);
      expect(existsSync(source), mapping.source).toBe(true);
      expect(readFileSync(source, "utf8"), mapping.source).toContain(mapping.source_anchor);
    }
  });

  it("renders the mapped command-spine components with durable mapping anchors", () => {
    setActivePinia(createPinia());
    const componentRouter = router();
    const global = { plugins: [createPinia(), componentRouter] };
    const sidebar = mount(Sidebar, { global });
    const workspace = mount(Workspace, { global });
    const menuRow = mount(MenuRow, {
      global,
      props: { item: { icon: "file", label: "Design contract", active: true } }
    });

    expect(sidebar.get("[data-figma-component='Sidebar Companion/Icon rail']").exists()).toBe(true);
    expect(workspace.find("[data-figma-component='Sidebar Companion/Detail panel']").exists()).toBe(true);
    expect(menuRow.get("[data-figma-component='Sidebar Companion/Menu row']").exists()).toBe(true);
    expect(menuRow.classes()).toContain("active");
  });
});
