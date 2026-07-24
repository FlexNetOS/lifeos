// Svelte counterpart of tests/Badge.spec.js — same assertions against Badge.svelte.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import Badge from "@/components/Badge.svelte";

describe("Badge.svelte", () => {
  afterEach(() => cleanup());

  it("renders nothing when count and dot are both absent", () => {
    const { container } = render(Badge, { props: {} });
    // Svelte leaves only comment anchors where Vue leaves "<!--v-if-->".
    expect(container.querySelector("span")).toBeNull();
    expect(container.textContent.trim()).toBe("");
  });

  it("renders a dot when dot=true", () => {
    const { container } = render(Badge, { props: { dot: true, tone: "ok" } });
    expect(container.firstElementChild.classList.contains("status-dot")).toBe(true);
  });

  it("renders a count badge", () => {
    const { container } = render(Badge, { props: { count: 5, tone: "err" } });
    expect(container.textContent.trim()).toBe("5");
    expect(container.firstElementChild.classList.contains("count")).toBe(true);
    expect(container.firstElementChild.classList.contains("tone-err")).toBe(true);
  });

  it("renders 99+ for counts > 99", () => {
    const { container } = render(Badge, { props: { count: 1234 } });
    expect(container.textContent.trim()).toBe("99+");
  });
});
