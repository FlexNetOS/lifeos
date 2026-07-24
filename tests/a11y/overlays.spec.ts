// LifeOS — a11y regression suite: interactive overlays (open + closed states) — Svelte
// Ported 1:1 from the Vue suite at the phase-3 cutover. Open/closed is store-
// driven exactly as in the app (the Vue suite's open/notifications props were
// undeclared fallthroughs). Where Vue stubbed <Teleport>, the Svelte ports
// really teleport to document.body via the portal action, so open-state
// assertions and axe scans target the teleported panel there.
//
// Requires: bun add -D 'vitest-axe@0.1.0' 'axe-core'
// Run: bun run test:a11y

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { axe } from "vitest-axe";

import CommandPalette from "@/components/CommandPalette.svelte";
import KeyboardHelp from "@/components/KeyboardHelp.svelte";
import NotificationsDrawer from "@/components/NotificationsDrawer.svelte";
import ToastContainer from "@/components/ToastContainer.svelte";
import { useLifeos } from "@/stores/lifeos.js";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", component: {} }],
});

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => cleanup());

const axeOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
};

const axeTarget = (container: HTMLElement): Element | string =>
  container.firstElementChild ?? (container.innerHTML || "<div />");

// — CommandPalette ————————————————————————————————————————————
describe("CommandPalette", () => {
  it("has no a11y violations when closed", async () => {
    const { container } = render(CommandPalette, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when open", async () => {
    useLifeos().openCmdk("");
    render(CommandPalette, { props: { router: makeRouter() } });
    await tick();
    const panel = document.body.querySelector("[data-figma-reference='5:49#command-menu']");
    expect(panel).not.toBeNull();
    expect(await axe(panel as Element, axeOptions)).toHaveNoViolations();
  });
});

// — KeyboardHelp ————————————————————————————————————————————
describe("KeyboardHelp", () => {
  it("has no a11y violations when closed", async () => {
    const { container } = render(KeyboardHelp);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when open", async () => {
    const { container } = render(KeyboardHelp);
    // "?" opens the overlay — same trigger the app uses.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    await tick();
    const overlay =
      container.firstElementChild ??
      document.body.querySelector(".keyboard-help, [role='dialog']");
    expect(overlay).not.toBeNull();
    expect(await axe(overlay as Element, axeOptions)).toHaveNoViolations();
  });
});

// — NotificationsDrawer ————————————————————————————————————————
describe("NotificationsDrawer", () => {
  it("has no a11y violations when closed", async () => {
    const { container } = render(NotificationsDrawer);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when open", async () => {
    useLifeos().openNotificationsDrawer();
    render(NotificationsDrawer);
    await tick();
    const panel = document.body.querySelector("[data-figma-reference='5:49#temporary-panels']");
    expect(panel).not.toBeNull();
    expect(await axe(panel as Element, axeOptions)).toHaveNoViolations();
  });
});

// — ToastContainer ————————————————————————————————————————————
describe("ToastContainer", () => {
  it("has no a11y violations with no toasts", async () => {
    const { container } = render(ToastContainer);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations with all toast variants visible", async () => {
    const { container } = render(ToastContainer);
    // ToastContainer reads from the useToasts store; seed one of each variant.
    const { useToasts } = await import("@/stores/toasts.js");
    const toasts = useToasts();
    toasts.push({ message: "Info toast", variant: "info" });
    toasts.push({ message: "Success toast", variant: "success" });
    toasts.push({ message: "Warning toast", variant: "warn" });
    toasts.push({ message: "Error toast", variant: "error" });
    await tick();
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});
