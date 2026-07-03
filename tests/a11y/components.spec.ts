// LifeOS — a11y regression suite: stateful component variants
//
// Requires: bun add -D 'vitest-axe@0.1.0' 'axe-core'
// Run: bun run test:a11y

import { describe, it, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { axe } from "vitest-axe";

import Sidebar from "@/components/Sidebar.vue";
import AIAvatar from "@/components/AIAvatar.vue";
import TelemetryWidget from "@/components/TelemetryWidget.vue";
import Badge from "@/components/Badge.vue";
import Icon from "@/components/Icon.vue";
import MenuRow from "@/components/MenuRow.vue";

// Real router via createMemoryHistory — components such as Sidebar use Vue
// Router's Symbol injection, which stubs alone do not satisfy.
const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", component: { template: "<div />" } }],
});

const globalOpts = () => ({
  global: {
    plugins: [createPinia(), makeRouter()],
    stubs: {
      RouterView: { template: '<div />' },
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

// — Sidebar ————————————————————————————————————————————————
describe("Sidebar", () => {
  it("has no a11y violations when expanded", async () => {
    const w = mount(Sidebar, {
      ...globalOpts(),
      props: { data: window.LIFEOS_DATA ?? {} },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when collapsed", async () => {
    const w = mount(Sidebar, {
      ...globalOpts(),
      props: { data: window.LIFEOS_DATA ?? {}, collapsed: true },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — AIAvatar ————————————————————————————————————————————————
describe("AIAvatar", () => {
  it("has no a11y violations when hidden", async () => {
    const w = mount(AIAvatar, {
      ...globalOpts(),
      props: { hidden: true },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when visible (chat closed)", async () => {
    const w = mount(AIAvatar, {
      ...globalOpts(),
      props: { hidden: false },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations with chat open", async () => {
    const w = mount(AIAvatar, {
      ...globalOpts(),
      props: { hidden: false, chatOpen: true },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — TelemetryWidget ————————————————————————————————————————
describe("TelemetryWidget", () => {
  it("has no a11y violations in loading state", async () => {
    const w = mount(TelemetryWidget, {
      ...globalOpts(),
      props: { loading: true },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations in loaded state", async () => {
    const w = mount(TelemetryWidget, {
      ...globalOpts(),
      props: {
        loading: false,
        telemetry: {
          cpuPercent: 42,
          memUsedGb: 8.2,
          memTotalGb: 16,
          netRxKbps: 1240,
          netTxKbps: 380,
          uptimeSecs: 86400,
        },
      },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations in error state", async () => {
    const w = mount(TelemetryWidget, {
      ...globalOpts(),
      props: { loading: false, error: "Could not read telemetry" },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — Badge ————————————————————————————————————————————————
describe("Badge", () => {
  it("has no a11y violations (count, info tone)", async () => {
    const w = mount(Badge, {
      ...globalOpts(),
      props: { count: 7, tone: "info" },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations (count, err tone)", async () => {
    const w = mount(Badge, {
      ...globalOpts(),
      props: { count: 3, tone: "err" },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — Icon ————————————————————————————————————————————————
describe("Icon", () => {
  it("has no a11y violations (known icon)", async () => {
    const w = mount(Icon, {
      ...globalOpts(),
      props: { name: "bell", size: 20 },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations (unknown icon — fallback span)", async () => {
    const w = mount(Icon, {
      ...globalOpts(),
      props: { name: "does-not-exist", size: 16 },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — MenuRow ————————————————————————————————————————————————
describe("MenuRow", () => {
  it("has no a11y violations (idle)", async () => {
    const w = mount(MenuRow, {
      ...globalOpts(),
      props: { item: { icon: "file", label: "Document", meta: "3 files" } },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations (active state)", async () => {
    const w = mount(MenuRow, {
      ...globalOpts(),
      props: { item: { icon: "file", label: "Document", meta: "3 files", active: true } },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});
