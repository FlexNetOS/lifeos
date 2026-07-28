// Svelte counterpart of tests/FilesView.spec.js — same assertions, same fixture,
// against the Svelte port (src/components/FilesView.svelte) instead of FilesView.vue.
// Covers: canvas renders, summary line, folders, recent files, folder filtering,
// aria roles, empty state, toast on file click.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { useToasts } from "@/stores/toasts-native";
import FilesView from "@/components/FilesView.svelte";
import { useLifeos } from "@/stores/lifeos.js";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/workspace/:id?/:section?/:sub?", component: { template: "<div />" } },
    { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
    { path: "/", redirect: "/workspace/ai" },
  ],
});

describe("FilesView.svelte", () => {
  let pinia, router;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    useToasts().clear();
    router = makeRouter();
    await router.push("/");
    await router.isReady();
  });

  afterEach(() => cleanup());

  const renderWithSub = (workspaceId = "work") => {
    const store = useLifeos();
    store.activeId = workspaceId;
    store.activeSub = {
      workspaceId,
      sectionTitle: "Files",
      item: { icon: "folder-tree", label: "Browse files", view: "files" },
    };
    return render(FilesView, { props: { router } });
  };

  it("renders .files-canvas with the correct workspace eyebrow", () => {
    const { container } = renderWithSub("work");
    expect(container.querySelector(".files-canvas")).not.toBeNull();
    expect(container.querySelector(".canvas-eyebrow").textContent).toContain("Work");
  });

  it("renders the Personal eyebrow for personal workspace", () => {
    const { container } = renderWithSub("personal");
    expect(container.querySelector(".canvas-eyebrow").textContent).toContain("Personal");
  });

  it("renders the summary line with folder and recent counts", () => {
    const { container } = renderWithSub("work");
    const summary = container.querySelector(".lights-summary");
    expect(summary).not.toBeNull();
    // fixture: 3 folders, 5 recent (from setup.js)
    expect(summary.textContent).toMatch(/\d+ folders/);
    expect(summary.textContent).toMatch(/\d+ recent/);
  });

  it("renders folder list with role=navigation and aria-label", () => {
    const { container } = renderWithSub("work");
    const nav = container.querySelector('[role="navigation"][aria-label="File folders"]');
    expect(nav).not.toBeNull();
  });

  it("renders one folder row per folder in the fixture", () => {
    const { container } = renderWithSub("work");
    // fixture has 3 work folders
    const rows = Array.from(container.querySelectorAll(".files-folder-row"));
    // rows includes possible clear-all button — find only real folder rows by aria-pressed
    const folderRows = rows.filter((r) => r.getAttribute("aria-pressed") !== null);
    expect(folderRows.length).toBe(3);
  });

  it("renders recent files as role=list with listitem rows", () => {
    const { container } = renderWithSub("work");
    const list = container.querySelector('[role="list"]');
    expect(list).not.toBeNull();
    const items = list.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(5); // fixture: 5 work recent files
  });

  it("each recent row has an aria-label", () => {
    const { container } = renderWithSub("work");
    const items = Array.from(container.querySelectorAll('[role="listitem"]'));
    items.forEach((item) => {
      expect(item.getAttribute("aria-label")).toBeTruthy();
    });
  });

  it("clicking a folder sets it as active (aria-pressed=true) and filters recent list", async () => {
    const { container } = renderWithSub("work");
    const folderRows = Array.from(container.querySelectorAll(".files-folder-row")).filter(
      (r) => r.getAttribute("aria-pressed") !== null
    );
    // First folder is wf-src with 3 recent files in fixture
    await fireEvent.click(folderRows[0]);
    expect(folderRows[0].getAttribute("aria-pressed")).toBe("true");

    // After filtering, only files from wf-src should appear (wr1, wr2 from fixture — App.vue + data.js)
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(5);
  });

  it("clicking the active folder again clears the filter (shows all)", async () => {
    const { container } = renderWithSub("work");
    const folderRows = Array.from(container.querySelectorAll(".files-folder-row")).filter(
      (r) => r.getAttribute("aria-pressed") !== null
    );
    await fireEvent.click(folderRows[0]);
    await fireEvent.click(folderRows[0]); // toggle off
    expect(folderRows[0].getAttribute("aria-pressed")).toBe("false");
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(5);
  });

  it("renders personal workspace files for personal", () => {
    const { container } = renderWithSub("personal");
    // fixture has 2 personal folders, 3 recent
    const folderRows = Array.from(container.querySelectorAll(".files-folder-row")).filter(
      (r) => r.getAttribute("aria-pressed") !== null
    );
    expect(folderRows.length).toBe(2);
    const items = container.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(3);
  });

  it("clicking a recent file row shows an info toast", async () => {
    const { container } = renderWithSub("work");
    const toastStore = useToasts();
    const before = toastStore.items.length;
    const firstItem = container.querySelector('[role="listitem"]');
    await fireEvent.click(firstItem);
    expect(toastStore.items.length).toBe(before + 1);
    expect(toastStore.items.at(-1).message).toMatch(/Opening .+ — coming in the editor/);
  });

  it("shows empty state when no files in the workspace", () => {
    // Temporarily override LIFEOS_DATA.files for this test
    const original = window.LIFEOS_DATA.files;
    window.LIFEOS_DATA.files = { work: { folders: [], recent: [] }, personal: { folders: [], recent: [] } };
    const { container } = renderWithSub("work");
    expect(container.querySelector(".sub-empty")).not.toBeNull();
    expect(container.querySelector(".files-canvas")).not.toBeNull();
    window.LIFEOS_DATA.files = original;
  });
});
