// Svelte counterpart of tests/MenuRow.spec.js — same assertions against
// MenuRow.svelte (Vue emit("click") becomes the onclick callback prop).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import MenuRow from "@/components/MenuRow.svelte";

const item = { icon: "home", label: "Living room", meta: "3 lights on", status: "good", badge: { count: 2, tone: "info" } };

describe("MenuRow.svelte", () => {
  afterEach(() => cleanup());

  it("renders label and meta", () => {
    const { container } = render(MenuRow, { props: { item } });
    expect(container.textContent).toContain("Living room");
    expect(container.textContent).toContain("3 lights on");
  });

  it("emits click with item payload when clicked", async () => {
    const onclick = vi.fn();
    const { container } = render(MenuRow, { props: { item, onclick } });
    await fireEvent.click(container.querySelector(".menu-row"));
    expect(onclick).toHaveBeenCalled();
    expect(onclick.mock.calls[0][0].label).toBe("Living room");
  });

  it("emits click on Enter key (a11y)", async () => {
    const onclick = vi.fn();
    const { container } = render(MenuRow, { props: { item, onclick } });
    await fireEvent.keyDown(container.querySelector(".menu-row"), { key: "Enter" });
    expect(onclick).toHaveBeenCalled();
  });

  it("emits click on Space key (a11y)", async () => {
    const onclick = vi.fn();
    const { container } = render(MenuRow, { props: { item, onclick } });
    await fireEvent.keyDown(container.querySelector(".menu-row"), { key: " " });
    expect(onclick).toHaveBeenCalled();
  });

  it("hides body in collapsed mode", () => {
    const { container } = render(MenuRow, { props: { item, collapsed: true } });
    expect(container.querySelector(".body")).toBeNull();
  });

  it("applies active class when item.active is true", () => {
    const { container } = render(MenuRow, { props: { item: { ...item, active: true } } });
    expect(container.querySelector(".menu-row").classList.contains("active")).toBe(true);
  });
});
