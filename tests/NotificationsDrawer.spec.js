// LifeOS — NotificationsDrawer SFC tests.
// The drawer uses <Teleport to="body"> so all DOM queries hit document.body.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NotificationsDrawer from "@/components/NotificationsDrawer.vue";
import { useLifeos } from "@/stores/lifeos.js";

describe("NotificationsDrawer.vue", () => {
  let pinia, store, w;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    store = useLifeos();
    w = mount(NotificationsDrawer, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
  });

  afterEach(() => {
    w?.unmount();
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
    await dismissBtn.click();
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
    await markBtn.click();
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
