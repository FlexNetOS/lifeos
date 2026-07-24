// LifeOS — a11y regression suite: dedicated views (Svelte)
// Asserts 0 axe violations (wcag2a, wcag2aa, wcag21aa) for every dedicated view
// at idle/default state. Ported 1:1 from the Vue suite at the phase-3 cutover —
// same describes, same states; components mount via @testing-library/svelte and
// read the same window.LIFEOS_DATA fixture (the extra per-mount props the Vue
// suite passed were undeclared fallthroughs the components never read).
//
// Requires: bun add -D 'vitest-axe@0.1.0' 'axe-core'
// Run: bun run test:a11y

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { axe } from "vitest-axe";

import Dashboard from "@/components/Dashboard.svelte";
import LightsView from "@/components/LightsView.svelte";
import CalendarView from "@/components/CalendarView.svelte";
import FilesView from "@/components/FilesView.svelte";
import HealthView from "@/components/HealthView.svelte";
import IoTView from "@/components/IoTView.svelte";
import ContactsView from "@/components/ContactsView.svelte";
import SettingsView from "@/components/SettingsView.svelte";
import N8nFlowView from "@/components/N8nFlowView.svelte";
import OpenPencilEditor from "@/components/OpenPencilEditor.svelte";

// Real router via createMemoryHistory — the Svelte components take it as a
// direct `router` prop (see src/lib/svelte-nav.js).
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

// Components that render nothing at idle leave an empty container; axe accepts
// an element or an HTML string, so fall back to a harmless empty div.
const axeTarget = (container: HTMLElement): Element | string =>
  container.firstElementChild ?? (container.innerHTML || "<div />");

const openPencilSub = {
  sectionTitle: "Files",
  item: {
    icon: "file-code",
    label: "App.vue",
    meta: "Vue shell",
    path: "src/App.vue",
    view: "open-pencil",
    pane: "files",
  },
};

// — Dashboard ————————————————————————————————————————————————
describe("Dashboard", () => {
  it("has no a11y violations at idle", async () => {
    const { container } = render(Dashboard, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — LightsView ————————————————————————————————————————————————
describe("LightsView", () => {
  it("has no a11y violations at idle", async () => {
    const { container } = render(LightsView, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — CalendarView ————————————————————————————————————————————————
describe("CalendarView", () => {
  it("has no a11y violations at idle", async () => {
    const { container } = render(CalendarView, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — FilesView ————————————————————————————————————————————————
describe("FilesView", () => {
  it("has no a11y violations at idle", async () => {
    const { container } = render(FilesView, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — HealthView ————————————————————————————————————————————————
describe("HealthView", () => {
  it("has no a11y violations at idle", async () => {
    const { container } = render(HealthView, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — IoTView ————————————————————————————————————————————————
describe("IoTView", () => {
  it("has no a11y violations at idle", async () => {
    const { container } = render(IoTView, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — ContactsView — workspace context ————————————————————————————
describe("ContactsView (workspace)", () => {
  it("has no a11y violations at idle", async () => {
    const { container } = render(ContactsView, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — ContactsView — aggregator context ————————————————————————
describe("ContactsView (aggregator)", () => {
  it("has no a11y violations in aggregator mode", async () => {
    // Aggregator mode is store-driven: the footer "contacts" entry resolves via
    // LIFEOS_AGGREGATORS when it is the active workspace.
    const { useLifeos } = await import("@/stores/lifeos.js");
    useLifeos().pickWorkspace("contacts");
    const { container } = render(ContactsView, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — SettingsView ————————————————————————————————————————————————
describe("SettingsView", () => {
  it("has no a11y violations at idle", async () => {
    const { container } = render(SettingsView);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — N8nFlowView ————————————————————————————————————————————————
// N8nFlowView falls back to SubsectionView when no sub is active, which renders
// nothing — axeTarget's HTML-string fallback covers the empty render.
describe("N8nFlowView", () => {
  it("has no a11y violations at idle", async () => {
    const { container } = render(N8nFlowView);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — OpenPencilEditor ————————————————————————————————————————————
describe("OpenPencilEditor", () => {
  it("has no a11y violations in files mode", async () => {
    const { container } = render(OpenPencilEditor, {
      props: { sub: openPencilSub, router: makeRouter() },
    });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});
