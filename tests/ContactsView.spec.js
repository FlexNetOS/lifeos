// LifeOS — ContactsView SFC tests.
// Covers: canvas renders, count line, contact rows, filter chips,
// star toggle, row click toast, frequent card, empty state.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ContactsView from "@/components/ContactsView.vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useToasts } from "@/stores/toasts.js";

describe("ContactsView.vue", () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  const mountWork = () => {
    const store = useLifeos();
    store.activeId = "work";
    store.activeSub = { workspaceId: "work", sectionTitle: "Contacts", item: { icon: "users", label: "Contacts", view: "contacts" } };
    return mount(ContactsView, { global: { plugins: [pinia] } });
  };

  const mountAggregator = () => {
    const store = useLifeos();
    store.activeId = "contacts";
    store.activeSub = null;
    return mount(ContactsView, { global: { plugins: [pinia] } });
  };

  // ── 1. Canvas renders with region role ──────────────────────────────────────
  it("renders .contacts-canvas with role=region and aria-label", () => {
    const w = mountWork();
    const canvas = w.find(".contacts-canvas");
    expect(canvas.exists()).toBe(true);
    expect(canvas.attributes("role")).toBe("region");
    expect(canvas.attributes("aria-label")).toBe("Contacts");
  });

  // ── 2. Count + starred line ──────────────────────────────────────────────────
  it("renders the summary line with count and starred number", () => {
    const w = mountWork();
    const summary = w.find(".lights-summary");
    expect(summary.exists()).toBe(true);
    // fixture: 3 work contacts, 2 starred (wc01, wc02)
    expect(summary.text()).toMatch(/3 people/);
    expect(summary.text()).toMatch(/2 starred/);
  });

  // ── 3. Rows rendered per contact ────────────────────────────────────────────
  it("renders one row per contact in work context", () => {
    const w = mountWork();
    const list = w.find(".contacts-list");
    expect(list.exists()).toBe(true);
    expect(list.attributes("role")).toBe("list");
    const rows = list.findAll('[role="listitem"]');
    // fixture: 3 work contacts
    expect(rows.length).toBe(3);
  });

  it("each contact row has an aria-label", () => {
    const w = mountWork();
    const rows = w.find(".contacts-list").findAll('[role="listitem"]');
    rows.forEach((row) => {
      expect(row.attributes("aria-label")).toBeTruthy();
    });
  });

  // ── 4. Filter chips — radiogroup pattern ────────────────────────────────────
  it("renders filter chips as a radiogroup with All active by default", () => {
    const w = mountWork();
    const group = w.find('[role="radiogroup"]');
    expect(group.exists()).toBe(true);
    const chips = group.findAll('[role="radio"]');
    // work context: All, Starred, Recent (no Work/Personal chips)
    expect(chips.length).toBe(3);
    expect(chips[0].text()).toBe("All");
    expect(chips[0].attributes("aria-checked")).toBe("true");
    expect(chips[1].attributes("aria-checked")).toBe("false");
  });

  it("clicking Starred chip shows only starred contacts", async () => {
    const w = mountWork();
    const chips = w.findAll('[role="radio"]');
    const starredChip = chips.find((c) => c.text() === "Starred");
    await starredChip.trigger("click");
    expect(starredChip.attributes("aria-checked")).toBe("true");
    const rows = w.find(".contacts-list").findAll('[role="listitem"]');
    // fixture: wc01 + wc02 are starred
    expect(rows.length).toBe(2);
  });

  it("aggregator context shows Work and Personal extra chips", () => {
    const w = mountAggregator();
    const chips = w.findAll('[role="radio"]');
    const labels = chips.map((c) => c.text());
    expect(labels).toContain("Work");
    expect(labels).toContain("Personal");
  });

  // ── 5. Star button toggles starred UI state ──────────────────────────────────
  it("star button has aria-pressed matching starred state", () => {
    const w = mountWork();
    const rows = w.find(".contacts-list").findAll('[role="listitem"]');
    // wc01 is starred — first row
    const starBtn = rows[0].find(".contacts-star");
    expect(starBtn.attributes("aria-pressed")).toBe("true");
    // wc03 is not starred — third row
    const starBtn3 = rows[2].find(".contacts-star");
    expect(starBtn3.attributes("aria-pressed")).toBe("false");
  });

  it("clicking the star button toggles the pressed state", async () => {
    const w = mountWork();
    const rows = w.find(".contacts-list").findAll('[role="listitem"]');
    // wc03 starts unstarred
    const starBtn = rows[2].find(".contacts-star");
    expect(starBtn.attributes("aria-pressed")).toBe("false");
    await starBtn.trigger("click");
    expect(starBtn.attributes("aria-pressed")).toBe("true");
    // Toggle back
    await starBtn.trigger("click");
    expect(starBtn.attributes("aria-pressed")).toBe("false");
  });

  // ── 6. Row click fires a toast ───────────────────────────────────────────────
  it("clicking a contact row pushes an info toast", async () => {
    const w = mountWork();
    const toasts = useToasts();
    const rows = w.find(".contacts-list").findAll('[role="listitem"]');
    await rows[0].trigger("click");
    expect(toasts.items.length).toBeGreaterThan(0);
    expect(toasts.items[0].variant).toBe("info");
    expect(toasts.items[0].message).toContain("Priya Nair");
  });

  // ── 7. Frequent card shows starred contacts first ────────────────────────────
  it("frequent card renders up to 5 contacts with starred ones first", () => {
    const w = mountWork();
    const frequentList = w.find(".contacts-frequent-list");
    expect(frequentList.exists()).toBe(true);
    const items = frequentList.findAll('[role="listitem"]');
    // fixture has 3 work contacts so at most 3 in frequent
    expect(items.length).toBe(3);
    // First item should be a starred contact (wc01 or wc02)
    const firstText = items[0].text();
    // Both starred contacts contain star icon marker — check the name
    expect(firstText).toMatch(/Priya Nair|Marcus Johansson/);
  });

  // ── 8. Empty state ───────────────────────────────────────────────────────────
  it("shows empty state when no contacts exist", () => {
    const original = window.LIFEOS_DATA.contacts;
    window.LIFEOS_DATA.contacts = { work: [], personal: [] };
    const store = useLifeos();
    store.activeId = "work";
    store.activeSub = { workspaceId: "work", sectionTitle: "Contacts", item: { icon: "users", label: "Contacts", view: "contacts" } };
    const w = mount(ContactsView, { global: { plugins: [pinia] } });
    const empty = w.find(".sub-empty");
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain("No contacts yet · Import or add one to get started.");
    window.LIFEOS_DATA.contacts = original;
  });

  // ── 9. Aggregator merges both workspaces ─────────────────────────────────────
  it("aggregator context renders contacts from both workspaces", () => {
    const w = mountAggregator();
    const rows = w.find(".contacts-list").findAll('[role="listitem"]');
    // fixture: 3 work + 3 personal = 6 total
    expect(rows.length).toBe(6);
  });

  it("aggregator rows display workspace badges", () => {
    const w = mountAggregator();
    const badges = w.findAll(".contacts-ws-badge");
    expect(badges.length).toBeGreaterThan(0);
    const texts = badges.map((b) => b.text());
    expect(texts).toContain("Work");
    expect(texts).toContain("Personal");
  });
});
