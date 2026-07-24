// Svelte counterpart of tests/ContactsView.spec.js — same assertions, same fixture,
// against the Svelte port (src/components/ContactsView.svelte) instead of ContactsView.vue.
// Covers: canvas renders, count line, contact rows, filter chips,
// star toggle, row click toast, frequent card, empty state.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import ContactsView from "@/components/ContactsView.svelte";
import { useLifeos } from "@/stores/lifeos.js";
import { useToasts } from "@/stores/toasts.js";

const makeRouter = () => createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/workspace/:id?/:section?/:sub?", component: { template: "<div />" } },
    { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
    { path: "/", redirect: "/workspace/ai" },
  ],
});

describe("ContactsView.svelte", () => {
  let pinia, router;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = makeRouter();
    await router.push("/");
    await router.isReady();
  });

  afterEach(() => cleanup());

  const mountWork = () => {
    const store = useLifeos();
    store.activeId = "work";
    store.activeSub = { workspaceId: "work", sectionTitle: "Contacts", item: { icon: "users", label: "Contacts", view: "contacts" } };
    return render(ContactsView, { props: { router } });
  };

  const mountAggregator = () => {
    const store = useLifeos();
    store.activeId = "contacts";
    store.activeSub = null;
    return render(ContactsView, { props: { router } });
  };

  // ── 1. Canvas renders with region role ──────────────────────────────────────
  it("renders .contacts-canvas with role=region and aria-label", () => {
    const { container } = mountWork();
    const canvas = container.querySelector(".contacts-canvas");
    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute("role")).toBe("region");
    expect(canvas.getAttribute("aria-label")).toBe("Contacts");
  });

  // ── 2. Count + starred line ──────────────────────────────────────────────────
  it("renders the summary line with count and starred number", () => {
    const { container } = mountWork();
    const summary = container.querySelector(".lights-summary");
    expect(summary).not.toBeNull();
    // fixture: 3 work contacts, 2 starred (wc01, wc02)
    expect(summary.textContent).toMatch(/3 people/);
    expect(summary.textContent).toMatch(/2 starred/);
  });

  // ── 3. Rows rendered per contact ────────────────────────────────────────────
  it("renders one row per contact in work context", () => {
    const { container } = mountWork();
    const list = container.querySelector(".contacts-list");
    expect(list).not.toBeNull();
    expect(list.getAttribute("role")).toBe("list");
    const rows = list.querySelectorAll('[role="listitem"]');
    // fixture: 3 work contacts
    expect(rows.length).toBe(3);
  });

  it("each contact row has an aria-label", () => {
    const { container } = mountWork();
    const rows = container.querySelector(".contacts-list").querySelectorAll('[role="listitem"]');
    rows.forEach((row) => {
      expect(row.getAttribute("aria-label")).toBeTruthy();
    });
  });

  // ── 4. Filter chips — radiogroup pattern ────────────────────────────────────
  it("renders filter chips as a radiogroup with All active by default", () => {
    const { container } = mountWork();
    const group = container.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    const chips = group.querySelectorAll('[role="radio"]');
    // work context: All, Starred, Recent (no Work/Personal chips)
    expect(chips.length).toBe(3);
    expect(chips[0].textContent.trim()).toBe("All");
    expect(chips[0].getAttribute("aria-checked")).toBe("true");
    expect(chips[1].getAttribute("aria-checked")).toBe("false");
  });

  it("clicking Starred chip shows only starred contacts", async () => {
    const { container } = mountWork();
    const chips = Array.from(container.querySelectorAll('[role="radio"]'));
    const starredChip = chips.find((c) => c.textContent.trim() === "Starred");
    await fireEvent.click(starredChip);
    expect(starredChip.getAttribute("aria-checked")).toBe("true");
    const rows = container.querySelector(".contacts-list").querySelectorAll('[role="listitem"]');
    // fixture: wc01 + wc02 are starred
    expect(rows.length).toBe(2);
  });

  it("aggregator context shows Work and Personal extra chips", () => {
    const { container } = mountAggregator();
    const chips = Array.from(container.querySelectorAll('[role="radio"]'));
    const labels = chips.map((c) => c.textContent.trim());
    expect(labels).toContain("Work");
    expect(labels).toContain("Personal");
  });

  // ── 5. Star button toggles starred UI state ──────────────────────────────────
  it("star button has aria-pressed matching starred state", () => {
    const { container } = mountWork();
    const rows = container.querySelector(".contacts-list").querySelectorAll('[role="listitem"]');
    // wc01 is starred — first row
    const starBtn = rows[0].querySelector(".contacts-star");
    expect(starBtn.getAttribute("aria-pressed")).toBe("true");
    // wc03 is not starred — third row
    const starBtn3 = rows[2].querySelector(".contacts-star");
    expect(starBtn3.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking the star button toggles the pressed state", async () => {
    const { container } = mountWork();
    const rows = container.querySelector(".contacts-list").querySelectorAll('[role="listitem"]');
    // wc03 starts unstarred
    const starBtn = rows[2].querySelector(".contacts-star");
    expect(starBtn.getAttribute("aria-pressed")).toBe("false");
    await fireEvent.click(starBtn);
    expect(starBtn.getAttribute("aria-pressed")).toBe("true");
    // Toggle back
    await fireEvent.click(starBtn);
    expect(starBtn.getAttribute("aria-pressed")).toBe("false");
  });

  // ── 6. Row click fires a toast ───────────────────────────────────────────────
  it("clicking a contact row pushes an info toast", async () => {
    const { container } = mountWork();
    const toasts = useToasts();
    const rows = container.querySelector(".contacts-list").querySelectorAll('[role="listitem"]');
    await fireEvent.click(rows[0]);
    expect(toasts.items.length).toBeGreaterThan(0);
    expect(toasts.items[0].variant).toBe("info");
    expect(toasts.items[0].message).toContain("Priya Nair");
  });

  // ── 7. Frequent card shows starred contacts first ────────────────────────────
  it("frequent card renders up to 5 contacts with starred ones first", () => {
    const { container } = mountWork();
    const frequentList = container.querySelector(".contacts-frequent-list");
    expect(frequentList).not.toBeNull();
    const items = frequentList.querySelectorAll('[role="listitem"]');
    // fixture has 3 work contacts so at most 3 in frequent
    expect(items.length).toBe(3);
    // First item should be a starred contact (wc01 or wc02)
    const firstText = items[0].textContent;
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
    const { container } = render(ContactsView, { props: { router } });
    const empty = container.querySelector(".sub-empty");
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain("No contacts yet · Import or add one to get started.");
    window.LIFEOS_DATA.contacts = original;
  });

  // ── 9. Aggregator merges both workspaces ─────────────────────────────────────
  it("aggregator context renders contacts from both workspaces", () => {
    const { container } = mountAggregator();
    const rows = container.querySelector(".contacts-list").querySelectorAll('[role="listitem"]');
    // fixture: 3 work + 3 personal = 6 total
    expect(rows.length).toBe(6);
  });

  it("aggregator rows display workspace badges", () => {
    const { container } = mountAggregator();
    const badges = container.querySelectorAll(".contacts-ws-badge");
    expect(badges.length).toBeGreaterThan(0);
    const texts = Array.from(badges).map((b) => b.textContent.trim());
    expect(texts).toContain("Work");
    expect(texts).toContain("Personal");
  });
});
