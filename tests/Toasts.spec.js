// LifeOS — Toasts store + ToastContainer component tests.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useToasts } from "@/stores/toasts.js";

describe("useToasts store", () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with an empty items list", () => {
    const toasts = useToasts();
    expect(toasts.items).toHaveLength(0);
  });

  it("push() returns a unique id and appends to items", () => {
    const toasts = useToasts();
    const id1 = toasts.push({ message: "Hello", variant: "info" });
    const id2 = toasts.push({ message: "World", variant: "success" });
    expect(typeof id1).toBe("string");
    expect(typeof id2).toBe("string");
    expect(id1).not.toBe(id2);
    expect(toasts.items).toHaveLength(2);
    expect(toasts.items[0].id).toBe(id1);
    expect(toasts.items[1].id).toBe(id2);
  });

  it("push() stores the message and variant correctly", () => {
    const toasts = useToasts();
    toasts.push({ message: "Something went wrong", variant: "error" });
    expect(toasts.items[0].message).toBe("Something went wrong");
    expect(toasts.items[0].variant).toBe("error");
  });

  it("dismiss(id) removes the matching item", () => {
    const toasts = useToasts();
    const id = toasts.push({ message: "Bye", variant: "info" });
    expect(toasts.items).toHaveLength(1);
    toasts.dismiss(id);
    expect(toasts.items).toHaveLength(0);
  });

  it("dismiss(id) is a no-op for unknown ids", () => {
    const toasts = useToasts();
    toasts.push({ message: "Stay", variant: "info" });
    toasts.dismiss("nonexistent-id");
    expect(toasts.items).toHaveLength(1);
  });

  it("info() convenience wrapper maps to info variant", () => {
    const toasts = useToasts();
    toasts.info("Info message");
    expect(toasts.items[0].variant).toBe("info");
    expect(toasts.items[0].message).toBe("Info message");
  });

  it("success() convenience wrapper maps to success variant", () => {
    const toasts = useToasts();
    toasts.success("Done");
    expect(toasts.items[0].variant).toBe("success");
  });

  it("warn() convenience wrapper maps to warn variant", () => {
    const toasts = useToasts();
    toasts.warn("Watch out");
    expect(toasts.items[0].variant).toBe("warn");
  });

  it("error() convenience wrapper maps to error variant", () => {
    const toasts = useToasts();
    toasts.error("Something broke");
    expect(toasts.items[0].variant).toBe("error");
  });

  it("auto-dismisses after 3500 ms", () => {
    const toasts = useToasts();
    toasts.info("Temporary");
    expect(toasts.items).toHaveLength(1);
    vi.advanceTimersByTime(3500);
    expect(toasts.items).toHaveLength(0);
  });

  it("does not dismiss before 3500 ms", () => {
    const toasts = useToasts();
    toasts.info("Still here");
    vi.advanceTimersByTime(3499);
    expect(toasts.items).toHaveLength(1);
  });

  it("clear() removes all items and cancels all timers", () => {
    const toasts = useToasts();
    toasts.info("One");
    toasts.warn("Two");
    toasts.error("Three");
    expect(toasts.items).toHaveLength(3);
    toasts.clear();
    expect(toasts.items).toHaveLength(0);
    // Advancing time should not throw or re-add items
    vi.advanceTimersByTime(5000);
    expect(toasts.items).toHaveLength(0);
  });

  it("pauseTimer() prevents auto-dismiss while paused", () => {
    const toasts = useToasts();
    const id = toasts.info("Hover me");
    toasts.pauseTimer(id);
    vi.advanceTimersByTime(5000);
    expect(toasts.items).toHaveLength(1);
  });

  it("resumeTimer() restarts the dismiss timer after pause", () => {
    const toasts = useToasts();
    const id = toasts.info("Hover then leave");
    toasts.pauseTimer(id);
    vi.advanceTimersByTime(5000);
    expect(toasts.items).toHaveLength(1);
    toasts.resumeTimer(id);
    vi.advanceTimersByTime(3500);
    expect(toasts.items).toHaveLength(0);
  });
});
