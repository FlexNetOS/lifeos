import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Badge from "@/components/Badge.vue";

describe("Badge.vue", () => {
  it("renders nothing when count and dot are both absent", () => {
    const w = mount(Badge, { props: {} });
    expect(w.html().trim()).toBe("<!--v-if-->");
  });

  it("renders a dot when dot=true", () => {
    const w = mount(Badge, { props: { dot: true, tone: "ok" } });
    expect(w.classes()).toContain("status-dot");
  });

  it("renders a count badge", () => {
    const w = mount(Badge, { props: { count: 5, tone: "err" } });
    expect(w.text()).toBe("5");
    expect(w.classes()).toContain("count");
    expect(w.classes()).toContain("tone-err");
  });

  it("renders 99+ for counts > 99", () => {
    const w = mount(Badge, { props: { count: 1234 } });
    expect(w.text()).toBe("99+");
  });
});
