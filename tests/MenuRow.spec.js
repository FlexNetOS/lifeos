import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MenuRow from "@/components/MenuRow.vue";

const item = { icon: "home", label: "Living room", meta: "3 lights on", status: "good", badge: { count: 2, tone: "info" } };

describe("MenuRow.vue", () => {
  it("renders label and meta", () => {
    const w = mount(MenuRow, { props: { item } });
    expect(w.text()).toContain("Living room");
    expect(w.text()).toContain("3 lights on");
  });

  it("emits click with item payload when clicked", async () => {
    const w = mount(MenuRow, { props: { item } });
    await w.find(".menu-row").trigger("click");
    expect(w.emitted("click")).toBeTruthy();
    expect(w.emitted("click")[0][0].label).toBe("Living room");
  });

  it("emits click on Enter key (a11y)", async () => {
    const w = mount(MenuRow, { props: { item } });
    await w.find(".menu-row").trigger("keydown.enter");
    expect(w.emitted("click")).toBeTruthy();
  });

  it("emits click on Space key (a11y)", async () => {
    const w = mount(MenuRow, { props: { item } });
    await w.find(".menu-row").trigger("keydown.space");
    expect(w.emitted("click")).toBeTruthy();
  });

  it("hides body in collapsed mode", () => {
    const w = mount(MenuRow, { props: { item, collapsed: true } });
    expect(w.find(".body").exists()).toBe(false);
  });

  it("applies active class when item.active is true", () => {
    const w = mount(MenuRow, { props: { item: { ...item, active: true } } });
    expect(w.find(".menu-row").classes()).toContain("active");
  });
});
