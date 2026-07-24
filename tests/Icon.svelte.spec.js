// Svelte counterpart of tests/Icon.spec.js — same assertions against Icon.svelte.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import Icon from "@/components/Icon.svelte";

describe("Icon.svelte", () => {
  afterEach(() => cleanup());

  it("renders without errors for a known name", () => {
    const { container } = render(Icon, { props: { name: "home", size: 20 } });
    expect(container.firstElementChild).not.toBeNull();
    expect(container.firstElementChild.getAttribute("aria-hidden")).toBe("true");
  });

  it("kebab-case → PascalCase lookup", () => {
    const { container } = render(Icon, { props: { name: "play-circle", size: 16 } });
    expect(container.firstElementChild).not.toBeNull();
  });

  it("falls back to span placeholder for an unknown icon", () => {
    const { container } = render(Icon, { props: { name: "__definitely_not_an_icon__", size: 12 } });
    // Mocked lucide-svelte returns a stub for any string, so this primarily exercises the prop path.
    expect(container.querySelector("span")).not.toBeNull();
  });
});
