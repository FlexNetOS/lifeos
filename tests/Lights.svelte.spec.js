// Svelte counterpart of tests/Lights.spec.js — same assertions, same fixture,
// against the Svelte port (src/components/LightsView.svelte) instead of LightsView.vue.
// Solution A — Spatial Grid: scene strip, room cards, light tiles, schedule timeline.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import LightsView from "@/components/LightsView.svelte";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/workspace/:id?/:section?/:sub?", component: { template: "<div />" } },
    { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
    { path: "/", redirect: "/workspace/ai" },
  ],
});

describe("LightsView.svelte", () => {
  let pinia, router;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = makeRouter();
    await router.push("/");
    await router.isReady();
  });

  afterEach(() => cleanup());

  const renderIt = () => render(LightsView, { props: { router } });

  it("renders the canvas + summary line with on/total counts", () => {
    const { container } = renderIt();
    expect(container.querySelector(".lights-canvas")).not.toBeNull();
    // Fixture: 3 on (living strip + lamp + bedroom reading), 6 total
    const summary = container.querySelector(".lights-summary").textContent;
    expect(summary).toContain("3 of 6 on");
    expect(summary).toContain("3 rooms");
  });

  it("renders the scene strip as a radiogroup with one aria-checked scene", () => {
    const { container } = renderIt();
    const strip = container.querySelector('[role="radiogroup"]');
    expect(strip).not.toBeNull();
    const radios = Array.from(strip.querySelectorAll('[role="radio"]'));
    expect(radios.length).toBe(4); // focus, cinema, glow, sleep
    const checked = radios.filter((b) => b.getAttribute("aria-checked") === "true");
    expect(checked.length).toBe(1);
    expect(checked[0].textContent).toContain("Focus");
  });

  it("clicking a scene switches aria-checked to that scene", async () => {
    const { container } = renderIt();
    const radios = Array.from(container.querySelectorAll('[role="radio"]'));
    const cinema = radios.find((b) => b.textContent.includes("Cinema"));
    await fireEvent.click(cinema);
    expect(cinema.getAttribute("aria-checked")).toBe("true");
    const focus = radios.find((b) => b.textContent.includes("Focus"));
    expect(focus.getAttribute("aria-checked")).toBe("false");
  });

  it("renders one .room-card per room (region with aria-labelledby)", () => {
    const { container } = renderIt();
    const cards = Array.from(container.querySelectorAll(".room-card"));
    expect(cards.length).toBe(3);
    cards.forEach((card) => {
      expect(card.getAttribute("role")).toBe("region");
      expect(card.getAttribute("aria-labelledby")).toBeTruthy();
    });
    const titles = cards.map((c) => c.querySelector(".room-title").textContent.trim());
    expect(titles).toEqual(["Living Room", "Bedroom", "Kitchen"]);
  });

  it("renders one .light-tile per device, with aria-checked reflecting isOn", () => {
    const { container } = renderIt();
    const tiles = Array.from(container.querySelectorAll(".light-tile"));
    expect(tiles.length).toBe(6); // 3 + 2 + 1 in the test fixture
    tiles.forEach((t) => expect(t.getAttribute("role")).toBe("switch"));
    const onTiles = tiles.filter((t) => t.getAttribute("aria-checked") === "true");
    expect(onTiles.length).toBe(3); // Strip + Lamp + Reading
  });

  it("clicking a light tile toggles its aria-checked state", async () => {
    const { container } = renderIt();
    const tiles = Array.from(container.querySelectorAll(".light-tile"));
    const ceiling = tiles.find((t) => t.textContent.includes("Ceiling"));
    expect(ceiling.getAttribute("aria-checked")).toBe("false");
    await fireEvent.click(ceiling);
    expect(ceiling.getAttribute("aria-checked")).toBe("true");
    await fireEvent.click(ceiling);
    expect(ceiling.getAttribute("aria-checked")).toBe("false");
  });

  it("renders the schedule timeline with one row per schedule", () => {
    const { container } = renderIt();
    const aside = container.querySelector(".schedule-timeline");
    expect(aside).not.toBeNull();
    expect(aside.getAttribute("aria-label")).toBe("Lighting schedules");
    const rows = Array.from(aside.querySelectorAll(".schedule-row"));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain("07:00 AM");
    expect(rows[0].textContent).toContain("Morning wake");
    expect(rows[1].textContent).toContain("09:30 PM");
  });

  it("room-count badge shows .has-active class when activeInRoom > 0", () => {
    const { container } = renderIt();
    const counts = Array.from(container.querySelectorAll(".room-count"));
    expect(counts[0].classList.contains("has-active")).toBe(true); // Living: 2 on
    expect(counts[1].classList.contains("has-active")).toBe(true); // Bedroom: 1 on
    expect(counts[2].classList.contains("has-active")).toBe(false); // Kitchen: 0 on
  });

  // ----- v2: brightness sliders -----
  it("renders a brightness slider only on active tiles", () => {
    const { container } = renderIt();
    const wraps = container.querySelectorAll(".light-tile-wrap");
    // fixture: 3 on, 3 off → 3 sliders
    const sliders = Array.from(container.querySelectorAll("input.tile-brightness"));
    expect(sliders.length).toBe(3);
    // Each slider lives in a wrapper whose tile is aria-checked="true"
    sliders.forEach((s) => {
      const tile = s.parentElement.querySelector(".light-tile");
      expect(tile.getAttribute("aria-checked")).toBe("true");
      expect(s.getAttribute("aria-label")).toMatch(/^Brightness for /);
      expect(s.getAttribute("min")).toBe("0");
      expect(s.getAttribute("max")).toBe("100");
    });
    // Sanity: tile count unchanged
    expect(wraps.length).toBe(6);
  });

  it("dragging the brightness slider updates the tile-meta percentage", async () => {
    const { container } = renderIt();
    const tiles = Array.from(container.querySelectorAll(".light-tile"));
    const strip = tiles.find((t) => t.textContent.includes("Strip"));
    // fixture brightness is 80 → label reads "80%"
    expect(strip.querySelector(".tile-meta").textContent.trim()).toBe("80%");
    const wrap = strip.parentElement; // .light-tile-wrap
    const slider = wrap.querySelector("input.tile-brightness");
    slider.value = "55";
    await fireEvent.input(slider);
    await tick();
    expect(strip.querySelector(".tile-meta").textContent.trim()).toBe("55%");
  });

  // ----- v2: color-temp Kelvin meter -----
  it("renders a Kelvin meter only in rooms with at least one active light", () => {
    const { container } = renderIt();
    const cards = Array.from(container.querySelectorAll(".room-card"));
    // Living (2 on) + Bedroom (1 on) → meters present. Kitchen (0 on) → no meter.
    expect(cards[0].querySelector(".kelvin-meter")).not.toBeNull();
    expect(cards[1].querySelector(".kelvin-meter")).not.toBeNull();
    expect(cards[2].querySelector(".kelvin-meter")).toBeNull();
    // Living: avg(3000, 5000) = 4000K. Bedroom: 2700K. Both end with "K".
    expect(cards[0].querySelector(".kelvin-value").textContent.trim()).toBe("4000K");
    expect(cards[1].querySelector(".kelvin-value").textContent.trim()).toBe("2700K");
  });

  // ----- v2: roving tabindex on scene radiogroup -----
  it("Arrow Right cycles the active scene and only the checked scene is tabbable", async () => {
    const { container } = renderIt();
    const strip = container.querySelector('[role="radiogroup"]');
    let radios = Array.from(strip.querySelectorAll('[role="radio"]'));
    // Focus baseline — focus is on the first scene (Focus)
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(radios[0].getAttribute("tabindex")).toBe("0");
    expect(radios[1].getAttribute("tabindex")).toBe("-1");
    await fireEvent.keyDown(strip, { key: "ArrowRight" });
    radios = Array.from(strip.querySelectorAll('[role="radio"]'));
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(radios[1].getAttribute("tabindex")).toBe("0");
    expect(radios[0].getAttribute("tabindex")).toBe("-1");
    // Arrow Left back
    await fireEvent.keyDown(strip, { key: "ArrowLeft" });
    radios = Array.from(strip.querySelectorAll('[role="radio"]'));
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(radios[0].getAttribute("tabindex")).toBe("0");
  });

  // ----- v2: schedule edit / delete affordance -----
  it("renders edit + delete buttons on each schedule row with aria-labels", async () => {
    const { container } = renderIt();
    const rows = Array.from(container.querySelectorAll(".schedule-row"));
    expect(rows.length).toBe(2);
    rows.forEach((row) => {
      const actions = row.querySelectorAll(".schedule-action");
      expect(actions.length).toBe(2);
      expect(actions[0].getAttribute("aria-label")).toMatch(/^Edit /);
      expect(actions[1].getAttribute("aria-label")).toMatch(/^Delete /);
    });
    // Clicking edit calls lifeos.sendAiMessage — verify by message count + content
    const editBtn = rows[0].querySelectorAll(".schedule-action")[0];
    const { useLifeos } = await import("@/stores/lifeos.js");
    const store = useLifeos();
    const startLen = store.aiMessages.length;
    await fireEvent.click(editBtn);
    expect(store.aiMessages.length).toBe(startLen + 1);
    expect(store.aiMessages.at(-1).text).toMatch(/^Edit schedule "Morning wake"/);
    const deleteBtn = rows[1].querySelectorAll(".schedule-action")[1];
    await fireEvent.click(deleteBtn);
    expect(store.aiMessages.at(-1).text).toMatch(/^Delete schedule "Wind-down"/);
  });
});
