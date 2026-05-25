// LifeOS — FilesView SFC tests.
// Covers: canvas renders, summary line, folders, recent files, folder filtering,
// aria roles, empty state, toast on file click.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import FilesView from "@/components/FilesView.vue";
import { useLifeos } from "@/stores/lifeos.js";

describe("FilesView.vue", () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  const mountWithSub = (workspaceId = "work") => {
    const store = useLifeos();
    store.activeId = workspaceId;
    store.activeSub = {
      workspaceId,
      sectionTitle: "Files",
      item: { icon: "folder-tree", label: "Browse files", view: "files" },
    };
    return mount(FilesView, { global: { plugins: [pinia] } });
  };

  it("renders .files-canvas with the correct workspace eyebrow", () => {
    const w = mountWithSub("work");
    expect(w.find(".files-canvas").exists()).toBe(true);
    expect(w.find(".canvas-eyebrow").text()).toContain("Work");
  });

  it("renders the Personal eyebrow for personal workspace", () => {
    const w = mountWithSub("personal");
    expect(w.find(".canvas-eyebrow").text()).toContain("Personal");
  });

  it("renders the summary line with folder and recent counts", () => {
    const w = mountWithSub("work");
    const summary = w.find(".lights-summary");
    expect(summary.exists()).toBe(true);
    // fixture: 3 folders, 5 recent (from setup.js)
    expect(summary.text()).toMatch(/\d+ folders/);
    expect(summary.text()).toMatch(/\d+ recent/);
  });

  it("renders folder list with role=navigation and aria-label", () => {
    const w = mountWithSub("work");
    const nav = w.find('[role="navigation"][aria-label="File folders"]');
    expect(nav.exists()).toBe(true);
  });

  it("renders one folder row per folder in the fixture", () => {
    const w = mountWithSub("work");
    // fixture has 3 work folders
    const rows = w.findAll(".files-folder-row");
    // rows includes possible clear-all button — find only real folder rows by aria-pressed
    const folderRows = rows.filter((r) => r.attributes("aria-pressed") !== undefined);
    expect(folderRows.length).toBe(3);
  });

  it("renders recent files as role=list with listitem rows", () => {
    const w = mountWithSub("work");
    const list = w.find('[role="list"]');
    expect(list.exists()).toBe(true);
    const items = list.findAll('[role="listitem"]');
    expect(items.length).toBe(5); // fixture: 5 work recent files
  });

  it("each recent row has an aria-label", () => {
    const w = mountWithSub("work");
    const items = w.findAll('[role="listitem"]');
    items.forEach((item) => {
      expect(item.attributes("aria-label")).toBeTruthy();
    });
  });

  it("clicking a folder sets it as active (aria-pressed=true) and filters recent list", async () => {
    const w = mountWithSub("work");
    const folderRows = w.findAll(".files-folder-row").filter(
      (r) => r.attributes("aria-pressed") !== undefined
    );
    // First folder is wf-src with 3 recent files in fixture
    await folderRows[0].trigger("click");
    expect(folderRows[0].attributes("aria-pressed")).toBe("true");

    // After filtering, only files from wf-src should appear (wr1, wr2 from fixture — App.vue + data.js)
    const items = w.findAll('[role="listitem"]');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(5);
  });

  it("clicking the active folder again clears the filter (shows all)", async () => {
    const w = mountWithSub("work");
    const folderRows = w.findAll(".files-folder-row").filter(
      (r) => r.attributes("aria-pressed") !== undefined
    );
    await folderRows[0].trigger("click");
    await folderRows[0].trigger("click"); // toggle off
    expect(folderRows[0].attributes("aria-pressed")).toBe("false");
    const items = w.findAll('[role="listitem"]');
    expect(items.length).toBe(5);
  });

  it("renders personal workspace files for personal", () => {
    const w = mountWithSub("personal");
    // fixture has 2 personal folders, 3 recent
    const folderRows = w.findAll(".files-folder-row").filter(
      (r) => r.attributes("aria-pressed") !== undefined
    );
    expect(folderRows.length).toBe(2);
    const items = w.findAll('[role="listitem"]');
    expect(items.length).toBe(3);
  });

  it("clicking a recent file row shows an info toast", async () => {
    const w = mountWithSub("work");
    const { useToasts } = await import("@/stores/toasts.js");
    const toastStore = useToasts();
    const before = toastStore.items.length;
    const firstItem = w.find('[role="listitem"]');
    await firstItem.trigger("click");
    expect(toastStore.items.length).toBe(before + 1);
    expect(toastStore.items.at(-1).message).toMatch(/Opening .+ — coming in the editor/);
  });

  it("shows empty state when no files in the workspace", () => {
    // Temporarily override LIFEOS_DATA.files for this test
    const original = window.LIFEOS_DATA.files;
    window.LIFEOS_DATA.files = { work: { folders: [], recent: [] }, personal: { folders: [], recent: [] } };
    const w = mountWithSub("work");
    expect(w.find(".sub-empty").exists()).toBe(true);
    expect(w.find(".files-canvas").exists()).toBe(true);
    window.LIFEOS_DATA.files = original;
  });
});
