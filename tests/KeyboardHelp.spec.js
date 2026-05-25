// LifeOS — KeyboardHelp SFC tests.
// The overlay uses <Teleport to="body"> so DOM queries hit document.body.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KeyboardHelp from "@/components/KeyboardHelp.vue";

describe("KeyboardHelp.vue", () => {
  let pinia, w;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    w = mount(KeyboardHelp, { attachTo: document.body, global: { plugins: [pinia] } });
  });

  afterEach(() => {
    w?.unmount();
    document.body.innerHTML = "";
  });

  // -----------------------------------------------------------------------
  // 1. Renders nothing when closed
  // -----------------------------------------------------------------------
  it("renders nothing when closed", () => {
    expect(document.body.querySelector(".khelp-overlay")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2. `?` key opens the overlay
  // -----------------------------------------------------------------------
  it("opens the overlay when `?` is pressed", async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector(".khelp-overlay")).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 3. `Escape` closes the overlay
  // -----------------------------------------------------------------------
  it("closes the overlay when Escape is pressed", async () => {
    // Open first
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector(".khelp-overlay")).not.toBeNull();

    // Now close
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector(".khelp-overlay")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 4. Click on the backdrop dismisses; click inside dialog does NOT
  // -----------------------------------------------------------------------
  it("dismisses when clicking the backdrop", async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await flushPromises();

    const overlay = document.body.querySelector(".khelp-overlay");
    expect(overlay).not.toBeNull();

    // Simulate mousedown directly on the overlay (backdrop) element
    overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector(".khelp-overlay")).toBeNull();
  });

  it("does NOT dismiss when clicking inside the dialog panel", async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await flushPromises();

    const panel = document.body.querySelector(".khelp-panel");
    expect(panel).not.toBeNull();

    // Click on the panel itself — this should not close the overlay
    panel.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector(".khelp-overlay")).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 5. Pressing `?` inside an <input> does NOT open the overlay
  // -----------------------------------------------------------------------
  it("does NOT open when `?` is pressed while an input is focused", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    // Dispatch with input as the target
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector(".khelp-overlay")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 6. Snapshot / content assertions — at least one row per group, correct row count
  // -----------------------------------------------------------------------
  it("renders at least one shortcut row per group", async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await flushPromises();

    const groups = document.body.querySelectorAll(".khelp-group");
    // 4 groups: Global, Navigation, Lights, Command palette
    expect(groups.length).toBe(4);

    // Each group has at least one row
    groups.forEach((g) => {
      const rows = g.querySelectorAll(".khelp-row");
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders kbd badges for every shortcut item", async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await flushPromises();

    const rows = document.body.querySelectorAll(".khelp-row");
    // Total rows across all groups: 4 + 3 + 3 + 3 = 13
    expect(rows.length).toBe(13);

    // Every row has at least one kbd element
    rows.forEach((row) => {
      expect(row.querySelectorAll("kbd").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("has proper ARIA attributes on the dialog", async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await flushPromises();

    const panel = document.body.querySelector(".khelp-panel");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.getAttribute("aria-labelledby")).toBe("khelp-heading");

    const heading = document.body.querySelector("#khelp-heading");
    expect(heading).not.toBeNull();
    expect(heading.textContent).toContain("Keyboard shortcuts");
  });
});
