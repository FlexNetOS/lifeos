// Svelte counterpart of tests/NotificationsDrawer.spec.js — same assertions, same
// fixture, against the Svelte port (src/components/NotificationsDrawer.svelte) instead
// of NotificationsDrawer.vue. The drawer teleports to body (portal action) so all DOM
// queries hit document.body.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import NotificationsDrawer from "@/components/NotificationsDrawer.svelte";
import { useLifeos } from "@/stores/lifeos-native";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("NotificationsDrawer.svelte", () => {
  let pinia, store;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    useLifeos().resetUiState();
    store = useLifeos();
    render(NotificationsDrawer);
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("renders nothing when the drawer is closed", () => {
    expect(document.body.querySelector(".notif-drawer")).toBeNull();
  });

  it("opens when toggleNotificationsDrawer() is called", async () => {
    store.toggleNotificationsDrawer();
    await flushPromises();
    expect(document.body.querySelector(".notif-drawer")).not.toBeNull();
  });

  it("renders one list item per non-dismissed notification", async () => {
    store.openNotificationsDrawer();
    await flushPromises();
    const items = document.body.querySelectorAll("[role='listitem']");
    // Fixture has 6 notifications; none dismissed yet.
    expect(items.length).toBe(6);
  });

  it("clicking the dismiss button removes the item from the list", async () => {
    store.openNotificationsDrawer();
    await flushPromises();
    const before = document.body.querySelectorAll("[role='listitem']").length;
    const dismissBtn = document.body.querySelector(".notif-dismiss-btn");
    expect(dismissBtn).not.toBeNull();
    await fireEvent.click(dismissBtn);
    await flushPromises();
    const after = document.body.querySelectorAll("[role='listitem']").length;
    expect(after).toBe(before - 1);
  });

  it("clicking Mark all as read zeroes the unread count", async () => {
    store.openNotificationsDrawer();
    await flushPromises();
    // Fixture has 3 unread notifications.
    expect(store.unreadNotificationCount).toBeGreaterThan(0);
    const markBtn = document.body.querySelector(".notif-action-btn");
    await fireEvent.click(markBtn);
    await flushPromises();
    expect(store.unreadNotificationCount).toBe(0);
  });

  it("pressing Escape closes the drawer", async () => {
    store.openNotificationsDrawer();
    await flushPromises();
    expect(document.body.querySelector(".notif-drawer")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector(".notif-drawer")).toBeNull();
  });

  it("clicking the backdrop (outside the panel) closes the drawer", async () => {
    store.openNotificationsDrawer();
    await flushPromises();
    const backdrop = document.body.querySelector(".notif-backdrop");
    expect(backdrop).not.toBeNull();
    // Simulate a click whose target is the backdrop itself (not the inner panel).
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    expect(store.notificationsDrawerOpen).toBe(false);
  });

  it("shows the empty state when all notifications are dismissed", async () => {
    // Dismiss every notification in the fixture.
    const all = window.LIFEOS_DATA?.notifications || [];
    all.forEach((n) => store.dismissNotification(n.id));
    store.openNotificationsDrawer();
    await flushPromises();
    expect(document.body.querySelector(".notif-empty")).not.toBeNull();
    expect(document.body.querySelectorAll("[role='listitem']").length).toBe(0);
  });

  it("has role=dialog with aria-labelledby pointing at the heading", async () => {
    store.openNotificationsDrawer();
    await flushPromises();
    const dialog = document.body.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-labelledby")).toBe("notif-title");
    expect(document.body.querySelector("#notif-title")).not.toBeNull();
  });

  it("close button has an aria-label", async () => {
    store.openNotificationsDrawer();
    await flushPromises();
    const closeBtn = document.body.querySelector(".notif-close-btn");
    expect(closeBtn?.getAttribute("aria-label")).toBeTruthy();
  });
});
