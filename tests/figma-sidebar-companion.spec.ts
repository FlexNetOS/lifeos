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

  it("renders the brand and product-identity anchors added when the spec pages were consolidated", () => {
    setActivePinia(createPinia());
    const sidebar = render(Sidebar, { props: { router: router() } });

    expect(sidebar.container.querySelector("[data-figma-component='LifeOS Brand/App mark']")).not.toBeNull();
    expect(
      sidebar.container.querySelector("[data-figma-component='LifeOS Product Identity/Navigation triad']")
    ).not.toBeNull();
  });

  it("tracks the consolidated Figma structure and never resurrects the deleted page ids", () => {
    const receipt = manifest.connector_receipt;

    // The owner merged 5:25 / 166:2 / 181:2 onto page 0:1 by hand on 2026-07-27.
    expect(receipt.document_pages).toHaveLength(4);
    expect(receipt.page_sections.page_node_id).toBe("0:1");
    expect(receipt.page_sections.sections).toHaveLength(5);

    const dead = ["5:25", "166:2", "181:2"];
    const livePageIds = manifest.component_mappings.map(
      (m: any) => m.figma_reference?.page_node_id
    );
    for (const id of dead) expect(livePageIds).not.toContain(id);

    // Every specification section is backed by at least one mapping.
    const mappedSections = new Set(
      manifest.component_mappings
        .map((m: any) => m.figma_reference?.section_node_id)
        .filter(Boolean)
    );
    const specSections = receipt.page_sections.sections
      .filter((s: any) => s.status === "specification")
      .map((s: any) => s.node_id);
    expect(specSections).toHaveLength(3);
    for (const id of specSections) expect(mappedSections.has(id)).toBe(true);
  });
});
