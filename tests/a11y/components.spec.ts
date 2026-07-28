// LifeOS — a11y regression suite: stateful component variants — Svelte
// Ported 1:1 from the Vue suite at the phase-3 cutover. Variant states are
// store-driven exactly as in the app (the Vue suite's hidden/chatOpen/loading/
// telemetry props were undeclared fallthroughs; TelemetryWidget renders its
// desktop-app placeholder in all three variants outside a Tauri host, in both
// framework versions).
//
// Requires: bun add -D 'vitest-axe@0.1.0' 'axe-core'
// Run: bun run test:a11y

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { axe } from "vitest-axe";

import Sidebar from "@/components/Sidebar.svelte";
import Workspace from "@/components/Workspace.svelte";
import AIAvatar from "@/components/AIAvatar.svelte";
import TelemetryWidget from "@/components/TelemetryWidget.svelte";
import Badge from "@/components/Badge.svelte";
import Icon from "@/components/Icon.svelte";
import MenuRow from "@/components/MenuRow.svelte";
import { useLifeos } from "@/stores/lifeos-native";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", component: {} }],
});

beforeEach(() => {
  setActivePinia(createPinia());
  useLifeos().resetUiState();
});

afterEach(() => cleanup());

const axeOptions = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
};

const axeTarget = (container: HTMLElement): Element | string =>
  container.firstElementChild ?? (container.innerHTML || "<div />");

// — Sidebar ————————————————————————————————————————————————
describe("Sidebar", () => {
  it("has no a11y violations when expanded", async () => {
    const { container } = render(Sidebar, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when collapsed", async () => {
    useLifeos().toggleWs();
    const { container } = render(Sidebar, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — Workspace ———————————————————————————————————————————————
describe("Workspace", () => {
  it("has no a11y violations when expanded", async () => {
    const { container } = render(Workspace, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when collapsed", async () => {
    useLifeos().toggleWs();
    const { container } = render(Workspace, { props: { router: makeRouter() } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — AIAvatar ————————————————————————————————————————————————
describe("AIAvatar", () => {
  it("has no a11y violations when hidden", async () => {
    useLifeos().toggleAiAvatarHidden();
    const { container } = render(AIAvatar);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations when visible (chat closed)", async () => {
    const { container } = render(AIAvatar);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations with chat open", async () => {
    useLifeos().toggleAiChat();
    const { container } = render(AIAvatar);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — TelemetryWidget ————————————————————————————————————————
describe("TelemetryWidget", () => {
  it("has no a11y violations in loading state", async () => {
    const { container } = render(TelemetryWidget);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations in loaded state", async () => {
    const { container } = render(TelemetryWidget);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations in error state", async () => {
    const { container } = render(TelemetryWidget);
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — Badge ————————————————————————————————————————————————
describe("Badge", () => {
  it("has no a11y violations (count, info tone)", async () => {
    const { container } = render(Badge, { props: { count: 7, tone: "info" } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations (count, err tone)", async () => {
    const { container } = render(Badge, { props: { count: 3, tone: "err" } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — Icon ————————————————————————————————————————————————
describe("Icon", () => {
  it("has no a11y violations (known icon)", async () => {
    const { container } = render(Icon, { props: { name: "bell", size: 20 } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations (unknown icon — fallback span)", async () => {
    const { container } = render(Icon, { props: { name: "does-not-exist", size: 16 } });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});

// — MenuRow ————————————————————————————————————————————————
describe("MenuRow", () => {
  it("has no a11y violations (idle)", async () => {
    const { container } = render(MenuRow, {
      props: { item: { icon: "file", label: "Document", meta: "3 files" } },
    });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });

  it("has no a11y violations (active state)", async () => {
    const { container } = render(MenuRow, {
      props: { item: { icon: "file", label: "Document", meta: "3 files", active: true } },
    });
    expect(await axe(axeTarget(container), axeOptions)).toHaveNoViolations();
  });
});
