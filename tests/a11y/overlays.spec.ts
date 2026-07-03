// LifeOS — a11y regression suite: interactive overlays (open + closed states)
//
// Requires: bun add -D 'vitest-axe@0.1.0' 'axe-core'
// Run: bun run test:a11y

import { describe, it, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { axe } from "vitest-axe";

import CommandPalette from "@/components/CommandPalette.vue";
import KeyboardHelp from "@/components/KeyboardHelp.vue";
import NotificationsDrawer from "@/components/NotificationsDrawer.vue";
import ToastContainer from "@/components/ToastContainer.vue";

// Real router via createMemoryHistory — overlays such as CommandPalette use
// Vue Router's Symbol injection, which stubs alone do not satisfy.
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

// — CommandPalette ————————————————————————————————————————————
describe("CommandPalette", () => {
  it("has no a11y violations when closed", async () => {
    const w = mount(CommandPalette, {
      ...globalOpts(),
      props: { open: false },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when open", async () => {
    const w = mount(CommandPalette, {
      ...globalOpts(),
      props: { open: true },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — KeyboardHelp ————————————————————————————————————————————
describe("KeyboardHelp", () => {
  it("has no a11y violations when closed", async () => {
    const w = mount(KeyboardHelp, {
      ...globalOpts(),
      props: { open: false },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when open", async () => {
    const w = mount(KeyboardHelp, {
      ...globalOpts(),
      props: { open: true },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — NotificationsDrawer ————————————————————————————————————————
describe("NotificationsDrawer", () => {
  it("has no a11y violations when closed", async () => {
    const w = mount(NotificationsDrawer, {
      ...globalOpts(),
      props: {
        open: false,
        notifications: window.LIFEOS_DATA?.notifications ?? [],
      },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when open", async () => {
    const w = mount(NotificationsDrawer, {
      ...globalOpts(),
      props: {
        open: true,
        notifications: window.LIFEOS_DATA?.notifications ?? [],
      },
    });
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});

// — ToastContainer ————————————————————————————————————————————
describe("ToastContainer", () => {
  it("has no a11y violations with no toasts", async () => {
    const w = mount(ToastContainer, globalOpts());
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations with all toast variants visible", async () => {
    const w = mount(ToastContainer, {
      ...globalOpts(),
      // ToastContainer reads from the useToasts store; seed it via the pinia store directly.
      // The store exposes addToast — call it after mount via the component's exposed interface
      // or by triggering an action in the mounted store.
    });
    // Access the Pinia toasts store and add one of each variant.
    const { useToasts } = await import("@/stores/toasts");
    const toasts = useToasts();
    toasts.push({ message: "Info toast", variant: "info" });
    toasts.push({ message: "Success toast", variant: "success" });
    toasts.push({ message: "Warning toast", variant: "warn" });
    toasts.push({ message: "Error toast", variant: "error" });
    await w.vm.$nextTick();
    expect(await axe(w.element, axeOptions)).toHaveNoViolations();
  });
});
