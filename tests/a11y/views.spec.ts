// LifeOS — a11y regression suite: dedicated views
// Asserts 0 axe violations (wcag2a, wcag2aa, wcag21aa) for every dedicated view
// at idle/default state.
//
// Requires: bun add -D 'vitest-axe@0.1.0' 'axe-core'
// Run: bun run test:a11y

import { describe, it, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { axe } from "vitest-axe";

import Dashboard from "@/components/Dashboard.vue";
import LightsView from "@/components/LightsView.vue";
import CalendarView from "@/components/CalendarView.vue";
import FilesView from "@/components/FilesView.vue";
import HealthView from "@/components/HealthView.vue";
import IoTView from "@/components/IoTView.vue";
import ContactsView from "@/components/ContactsView.vue";
import SettingsView from "@/components/SettingsView.vue";
import N8nFlowView from "@/components/N8nFlowView.vue";
import OpenPencilEditor from "@/components/OpenPencilEditor.vue";

// Real router via createMemoryHistory — codex review surfaced that the prior
// `provide: { router: stub }` did not satisfy Vue Router's Symbol injection
// token and produced `[Vue warn]: injection "Symbol(router)" not found` floods.
const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", component: { template: "<div />" } }],
});

const globalOpts = () => ({
  global: {
    plugins: [createPinia(), makeRouter()],
    stubs: {
      Teleport: true,
    },
  },
});

beforeEach(() => {
  setActivePinia(createPinia());
});

const axeOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
};

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
    const w = mount(Dashboard, {
      ...globalOpts(),
      props: { canvas: window.LIFEOS_DATA?.dashboardCanvas ?? {} },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — LightsView ————————————————————————————————————————————————
describe("LightsView", () => {
  it("has no a11y violations at idle", async () => {
    const w = mount(LightsView, {
      ...globalOpts(),
      props: { lighting: window.LIFEOS_DATA?.lighting ?? {} },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — CalendarView ————————————————————————————————————————————————
describe("CalendarView", () => {
  it("has no a11y violations at idle", async () => {
    const w = mount(CalendarView, globalOpts());
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — FilesView ————————————————————————————————————————————————
describe("FilesView", () => {
  it("has no a11y violations at idle", async () => {
    const w = mount(FilesView, {
      ...globalOpts(),
      props: { files: window.LIFEOS_DATA?.files?.work ?? {} },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — HealthView ————————————————————————————————————————————————
describe("HealthView", () => {
  it("has no a11y violations at idle", async () => {
    const w = mount(HealthView, {
      ...globalOpts(),
      props: { health: window.LIFEOS_DATA?.health ?? {} },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — IoTView ————————————————————————————————————————————————
describe("IoTView", () => {
  it("has no a11y violations at idle", async () => {
    const w = mount(IoTView, {
      ...globalOpts(),
      props: { iot: window.LIFEOS_DATA?.iot ?? {} },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — ContactsView — workspace context ————————————————————————————
describe("ContactsView (workspace)", () => {
  it("has no a11y violations at idle", async () => {
    const w = mount(ContactsView, {
      ...globalOpts(),
      props: {
        contacts: window.LIFEOS_DATA?.contacts ?? {},
        context: "workspace",
      },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — ContactsView — aggregator context ————————————————————————
describe("ContactsView (aggregator)", () => {
  it("has no a11y violations in aggregator mode", async () => {
    const w = mount(ContactsView, {
      ...globalOpts(),
      props: {
        contacts: window.LIFEOS_DATA?.contacts ?? {},
        context: "aggregator",
      },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — SettingsView ————————————————————————————————————————————————
describe("SettingsView", () => {
  it("has no a11y violations at idle", async () => {
    const w = mount(SettingsView, globalOpts());
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — N8nFlowView ————————————————————————————————————————————————
// N8nFlowView reads `activeSub` from useLifeos(); when no sub is active the component
// renders a fragment that vue-test-utils returns as a null element. We mount it to
// document.body and scan the html string instead.
describe("N8nFlowView", () => {
  it("has no a11y violations at idle", async () => {
    const w = mount(N8nFlowView, {
      ...globalOpts(),
      attachTo: document.body,
    });
    const html = w.html() || "<div />";
    expect(await axe(html, axeOptions)).toHaveNoViolations();
    w.unmount();
  });
});

// — OpenPencilEditor ————————————————————————————————————————————
describe("OpenPencilEditor", () => {
  it("has no a11y violations in files mode", async () => {
    const w = mount(OpenPencilEditor, {
      ...globalOpts(),
      props: { sub: openPencilSub },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});
