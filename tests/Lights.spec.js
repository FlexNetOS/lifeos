// LifeOS — LightsView SFC tests (Phase 4, /ecc:multi-frontend).
// Solution A — Spatial Grid: scene strip, room cards, light tiles, schedule timeline.

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LightsView from "@/components/LightsView.vue";

describe("LightsView.vue", () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  const mountIt = () => mount(LightsView, { global: { plugins: [pinia] } });

  it("renders the canvas + summary line with on/total counts", () => {
    const w = mountIt();
    expect(w.find(".lights-canvas").exists()).toBe(true);
    // Fixture: 3 on (living strip + lamp + bedroom reading), 6 total
    const summary = w.find(".lights-summary").text();
    expect(summary).toContain("3 of 6 on");
    expect(summary).toContain("3 rooms");
  });

  it("renders the scene strip as a radiogroup with one aria-checked scene", () => {
    const w = mountIt();
    const strip = w.find('[role="radiogroup"]');
    expect(strip.exists()).toBe(true);
    const radios = strip.findAll('[role="radio"]');
    expect(radios.length).toBe(4); // focus, cinema, glow, sleep
    const checked = radios.filter((b) => b.attributes("aria-checked") === "true");
    expect(checked.length).toBe(1);
    expect(checked[0].text()).toContain("Focus");
  });

  it("clicking a scene switches aria-checked to that scene", async () => {
    const w = mountIt();
    const radios = w.findAll('[role="radio"]');
    const cinema = radios.find((b) => b.text().includes("Cinema"));
    await cinema.trigger("click");
    expect(cinema.attributes("aria-checked")).toBe("true");
    const focus = radios.find((b) => b.text().includes("Focus"));
    expect(focus.attributes("aria-checked")).toBe("false");
  });

  it("renders one .room-card per room (region with aria-labelledby)", () => {
    const w = mountIt();
    const cards = w.findAll(".room-card");
    expect(cards.length).toBe(3);
    cards.forEach((card) => {
      expect(card.attributes("role")).toBe("region");
      expect(card.attributes("aria-labelledby")).toBeTruthy();
    });
    const titles = cards.map((c) => c.find(".room-title").text());
    expect(titles).toEqual(["Living Room", "Bedroom", "Kitchen"]);
  });

  it("renders one .light-tile per device, with aria-checked reflecting isOn", () => {
    const w = mountIt();
    const tiles = w.findAll(".light-tile");
    expect(tiles.length).toBe(6); // 3 + 2 + 1 in the test fixture
    tiles.forEach((t) => expect(t.attributes("role")).toBe("switch"));
    const onTiles = tiles.filter((t) => t.attributes("aria-checked") === "true");
    expect(onTiles.length).toBe(3); // Strip + Lamp + Reading
  });

  it("clicking a light tile toggles its aria-checked state", async () => {
    const w = mountIt();
    const tiles = w.findAll(".light-tile");
    const ceiling = tiles.find((t) => t.text().includes("Ceiling"));
    expect(ceiling.attributes("aria-checked")).toBe("false");
    await ceiling.trigger("click");
    expect(ceiling.attributes("aria-checked")).toBe("true");
    await ceiling.trigger("click");
    expect(ceiling.attributes("aria-checked")).toBe("false");
  });

  it("renders the schedule timeline with one row per schedule", () => {
    const w = mountIt();
    const aside = w.find(".schedule-timeline");
    expect(aside.exists()).toBe(true);
    expect(aside.attributes("aria-label")).toBe("Lighting schedules");
    const rows = aside.findAll(".schedule-row");
    expect(rows.length).toBe(2);
    expect(rows[0].text()).toContain("07:00 AM");
    expect(rows[0].text()).toContain("Morning wake");
    expect(rows[1].text()).toContain("09:30 PM");
  });

  it("room-count badge shows .has-active class when activeInRoom > 0", () => {
    const w = mountIt();
    const counts = w.findAll(".room-count");
    expect(counts[0].classes()).toContain("has-active"); // Living: 2 on
    expect(counts[1].classes()).toContain("has-active"); // Bedroom: 1 on
    expect(counts[2].classes()).not.toContain("has-active"); // Kitchen: 0 on
  });

  // ----- v2: brightness sliders -----
  it("renders a brightness slider only on active tiles", () => {
    const w = mountIt();
    const wraps = w.findAll(".light-tile-wrap");
    // fixture: 3 on, 3 off → 3 sliders
    const sliders = w.findAll("input.tile-brightness");
    expect(sliders.length).toBe(3);
    // Each slider lives in a wrapper whose tile is aria-checked="true"
    sliders.forEach((s) => {
      const tile = s.element.parentElement.querySelector(".light-tile");
      expect(tile.getAttribute("aria-checked")).toBe("true");
      expect(s.attributes("aria-label")).toMatch(/^Brightness for /);
      expect(s.attributes("min")).toBe("0");
      expect(s.attributes("max")).toBe("100");
    });
    // Sanity: tile count unchanged
    expect(wraps.length).toBe(6);
  });

  it("dragging the brightness slider updates the tile-meta percentage", async () => {
    const w = mountIt();
    const tiles = w.findAll(".light-tile");
    const strip = tiles.find((t) => t.text().includes("Strip"));
    // fixture brightness is 80 → label reads "80%"
    expect(strip.find(".tile-meta").text()).toBe("80%");
    const wrap = strip.element.parentElement; // .light-tile-wrap
    const slider = wrap.querySelector("input.tile-brightness");
    slider.value = "55";
    slider.dispatchEvent(new Event("input"));
    await w.vm.$nextTick();
    expect(strip.find(".tile-meta").text()).toBe("55%");
  });

  // ----- v2: color-temp Kelvin meter -----
  it("renders a Kelvin meter only in rooms with at least one active light", () => {
    const w = mountIt();
    const cards = w.findAll(".room-card");
    // Living (2 on) + Bedroom (1 on) → meters present. Kitchen (0 on) → no meter.
    expect(cards[0].find(".kelvin-meter").exists()).toBe(true);
    expect(cards[1].find(".kelvin-meter").exists()).toBe(true);
    expect(cards[2].find(".kelvin-meter").exists()).toBe(false);
    // Living: avg(3000, 5000) = 4000K. Bedroom: 2700K. Both end with "K".
    expect(cards[0].find(".kelvin-value").text()).toBe("4000K");
    expect(cards[1].find(".kelvin-value").text()).toBe("2700K");
  });

  // ----- v2: roving tabindex on scene radiogroup -----
  it("Arrow Right cycles the active scene and only the checked scene is tabbable", async () => {
    const w = mountIt();
    const strip = w.find('[role="radiogroup"]');
    let radios = strip.findAll('[role="radio"]');
    // Focus baseline — focus is on the first scene (Focus)
    expect(radios[0].attributes("aria-checked")).toBe("true");
    expect(radios[0].attributes("tabindex")).toBe("0");
    expect(radios[1].attributes("tabindex")).toBe("-1");
    await strip.trigger("keydown.right");
    radios = strip.findAll('[role="radio"]');
    expect(radios[1].attributes("aria-checked")).toBe("true");
    expect(radios[1].attributes("tabindex")).toBe("0");
    expect(radios[0].attributes("tabindex")).toBe("-1");
    // Arrow Left back
    await strip.trigger("keydown.left");
    radios = strip.findAll('[role="radio"]');
    expect(radios[0].attributes("aria-checked")).toBe("true");
    expect(radios[0].attributes("tabindex")).toBe("0");
  });

  // ----- v2: schedule edit / delete affordance -----
  it("renders edit + delete buttons on each schedule row with aria-labels", async () => {
    const w = mountIt();
    const rows = w.findAll(".schedule-row");
    expect(rows.length).toBe(2);
    rows.forEach((row) => {
      const actions = row.findAll(".schedule-action");
      expect(actions.length).toBe(2);
      expect(actions[0].attributes("aria-label")).toMatch(/^Edit /);
      expect(actions[1].attributes("aria-label")).toMatch(/^Delete /);
    });
    // Clicking edit calls lifeos.sendAiMessage — verify by message count + content
    const editBtn = rows[0].findAll(".schedule-action")[0];
    const before = w.vm.$.appContext.config.globalProperties.$pinia
      ? null
      : null; // just exercise: relies on store side effect below
    const { useLifeos } = await import("@/stores/lifeos.js");
    const store = useLifeos();
    const startLen = store.aiMessages.length;
    await editBtn.trigger("click");
    expect(store.aiMessages.length).toBe(startLen + 1);
    expect(store.aiMessages.at(-1).text).toMatch(/^Edit schedule "Morning wake"/);
    const deleteBtn = rows[1].findAll(".schedule-action")[1];
    await deleteBtn.trigger("click");
    expect(store.aiMessages.at(-1).text).toMatch(/^Delete schedule "Wind-down"/);
  });
});
