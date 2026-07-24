// Svelte counterpart of tests/Toasts.spec.js for the component layer.
//
// tests/Toasts.spec.js contains ONLY store-level tests ("useToasts store" — no component
// is ever mounted; its `mount` import is unused). Those tests are framework-agnostic and
// stay covered by the existing spec, so they are NOT duplicated here. This spec provides
// the component-mount coverage for ToastContainer.svelte (the ToastContainer.vue template
// contract): stack region, per-item render, variant class + ARIA role mapping, message
// text, dismiss button, auto-dismiss, and hover pause / resume through the DOM handlers.
// The stack teleports to body (portal action) so DOM queries hit document.body.
//
// Fake-timer discipline mirrors tests/Toasts.spec.js (vi.useFakeTimers in beforeEach,
// vi.useRealTimers in afterEach, vi.advanceTimersByTime for the 3500 ms auto-dismiss).
// Svelte's flush is microtask-based, so `await tick()` (not a setTimeout-based
// flushPromises) is used to settle the DOM while timers are faked.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import { createPinia, setActivePinia } from "pinia";
import ToastContainer from "@/components/ToastContainer.svelte";
import { useToasts } from "@/stores/toasts.js";

describe("ToastContainer.svelte", () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("renders the toast stack region (teleported to body) with no items initially", () => {
    render(ToastContainer);
    const stack = document.body.querySelector(".toast-stack");
    expect(stack).not.toBeNull();
    expect(stack.getAttribute("role")).toBe("region");
    expect(stack.getAttribute("aria-label")).toBe("Notifications");
    expect(stack.getAttribute("aria-live")).toBe("polite");
    expect(stack.querySelector(".toast-inner")).not.toBeNull();
    expect(document.body.querySelectorAll(".toast-item").length).toBe(0);
  });

  it("renders one toast item per store item", async () => {
    const toasts = useToasts();
    render(ToastContainer);
    toasts.info("One");
    toasts.success("Two");
    await tick();
    expect(document.body.querySelectorAll(".toast-item").length).toBe(2);
  });

  it("maps variant to class and ARIA role (info/success → status, warn/error → alert)", async () => {
    const toasts = useToasts();
    render(ToastContainer);
    toasts.info("FYI");
    toasts.error("Broken");
    await tick();
    const info = document.body.querySelector(".toast-info");
    const error = document.body.querySelector(".toast-error");
    expect(info).not.toBeNull();
    expect(error).not.toBeNull();
    expect(info.getAttribute("role")).toBe("status");
    expect(error.getAttribute("role")).toBe("alert");
  });

  it("renders the toast message text", async () => {
    const toasts = useToasts();
    render(ToastContainer);
    toasts.info("Saved to Work / Today.");
    await tick();
    expect(document.body.querySelector(".toast-message").textContent).toBe("Saved to Work / Today.");
  });

  it("dismisses a toast via its close button", async () => {
    const toasts = useToasts();
    render(ToastContainer);
    toasts.info("Bye");
    await tick();
    const closeBtn = document.body.querySelector(".toast-close");
    expect(closeBtn).not.toBeNull();
    expect(closeBtn.getAttribute("aria-label")).toBe("Dismiss notification: Bye");
    await fireEvent.click(closeBtn);
    await tick();
    expect(toasts.items).toHaveLength(0);
    expect(document.body.querySelectorAll(".toast-item").length).toBe(0);
  });

  it("auto-dismisses after 3500 ms", async () => {
    const toasts = useToasts();
    render(ToastContainer);
    toasts.info("Temporary");
    await tick();
    expect(document.body.querySelectorAll(".toast-item").length).toBe(1);
    vi.advanceTimersByTime(3500);
    await tick();
    expect(document.body.querySelectorAll(".toast-item").length).toBe(0);
  });

  it("hover pauses the auto-dismiss timer; leaving resumes it", async () => {
    const toasts = useToasts();
    render(ToastContainer);
    toasts.info("Hover me");
    await tick();
    const item = document.body.querySelector(".toast-item");
    expect(item).not.toBeNull();
    await fireEvent.mouseEnter(item);
    vi.advanceTimersByTime(5000);
    await tick();
    expect(document.body.querySelectorAll(".toast-item").length).toBe(1);
    await fireEvent.mouseLeave(item);
    vi.advanceTimersByTime(3500);
    await tick();
    expect(document.body.querySelectorAll(".toast-item").length).toBe(0);
  });
});
