import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import Sidebar from "@/components/Sidebar.svelte";
import Workspace from "@/components/Workspace.svelte";
import MenuRow from "@/components/MenuRow.svelte";

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(resolve(root, "design-system-reference/figma/sidebar-design-system-companion.json"), "utf8")
);

const router = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: {} }]
  });

afterEach(() => cleanup());

describe("Figma Sidebar Design System Companion connection", () => {
  it("pins the exact authorized design input and rejects screenshot authority", () => {
    expect(manifest.design_input.file_key).toBe("z7aJ8uZrOsvfnWlsApN0Bu");
    expect(manifest.design_input.node_id).toBe("0:1");
    expect(manifest.authority_guards.no_stale_screenshot_authority).toBe(true);
    expect(manifest.connector_receipt.code_connect.status).toBe("seat_gated");
  });

  it("keeps every source mapping anchored in checked-in Svelte source", () => {
    for (const mapping of manifest.component_mappings) {
      const source = resolve(root, mapping.source);
      expect(existsSync(source), mapping.source).toBe(true);
      expect(readFileSync(source, "utf8"), mapping.source).toContain(mapping.source_anchor);
    }
  });

  it("renders the mapped command-spine components with durable mapping anchors", () => {
    setActivePinia(createPinia());
    const componentRouter = router();
    const sidebar = render(Sidebar, { props: { router: componentRouter } });
    const workspace = render(Workspace, { props: { router: componentRouter } });
    const menuRow = render(MenuRow, {
      props: { item: { icon: "file", label: "Design contract", active: true } }
    });

    expect(sidebar.container.querySelector("[data-figma-component='Sidebar Companion/Icon rail']")).not.toBeNull();
    expect(workspace.container.querySelector("[data-figma-component='Sidebar Companion/Detail panel']")).not.toBeNull();
    const row = menuRow.container.querySelector("[data-figma-component='Sidebar Companion/Menu row']");
    expect(row).not.toBeNull();
    expect(row!.classList.contains("active")).toBe(true);
  });
});
