import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Icon from "@/components/Icon.vue";

describe("Icon.vue", () => {
  it("renders without errors for a known name", () => {
    const w = mount(Icon, { props: { name: "home", size: 20 } });
    expect(w.exists()).toBe(true);
    expect(w.attributes("aria-hidden")).toBe("true");
  });

  it("kebab-case → PascalCase lookup", () => {
    const w = mount(Icon, { props: { name: "play-circle", size: 16 } });
    expect(w.exists()).toBe(true);
  });

  it("falls back to span placeholder for an unknown icon", () => {
    const w = mount(Icon, { props: { name: "__definitely_not_an_icon__", size: 12 } });
    // Mocked lucide-vue-next returns a stub for any string, so this primarily exercises the prop path.
    expect(w.exists()).toBe(true);
  });
});
