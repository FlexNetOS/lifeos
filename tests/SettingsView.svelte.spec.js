// Svelte counterpart of tests/SettingsView.spec.js — same assertions, same fixture,
// against the Svelte port (src/components/SettingsView.svelte) instead of SettingsView.vue.
// Covers: four sections render with role=region + aria-labelledby, the AI provider
// dropdown wires through to setAiProvider + toasts, the telemetry toggle flips the
// store, the refresh-rate radio sets the store, the reset button calls
// resetUiState, and the About card renders the version triplet (web preview).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import SettingsView from "@/components/SettingsView.svelte";
import { useLifeos } from "@/stores/lifeos-native";
import { useToasts } from "@/stores/toasts-native";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const setTauri = (invoke) => {
  if (invoke) window.__TAURI__ = { core: { invoke } };
  else delete window.__TAURI__;
};

describe("SettingsView.svelte", () => {
  let pinia;

  beforeEach(() => {
    setTauri(null);
    pinia = createPinia();
    setActivePinia(pinia);
    useLifeos().resetUiState();
    useToasts().clear();
  });

  afterEach(() => {
    setTauri(null);
    cleanup();
  });

  const mountView = () => render(SettingsView);

  it("mounts cleanly with the canvas root + section regions", () => {
    const { container } = mountView();
    expect(container.querySelector(".settings-canvas")).not.toBeNull();
    const regions = container.querySelectorAll('[role="region"]');
    // 1 canvas region + 5 settings-section regions in the main column
    // (Account, AI, Telemetry, Appearance, About) + 2 side-card regions.
    const settingsSections = container.querySelectorAll(".settings-section");
    expect(settingsSections.length).toBe(7);
    expect(regions.length).toBeGreaterThanOrEqual(8);
  });

  it("each settings section in the main column has aria-labelledby pointing to its heading", () => {
    const { container } = mountView();
    const ids = [
      "settings-account-heading",
      "settings-ai-heading",
      "settings-telemetry-heading",
      "settings-appearance-heading",
      "settings-about-heading",
    ];
    for (const id of ids) {
      const heading = container.querySelector(`#${id}`);
      expect(heading).not.toBeNull();
      const region = container.querySelector(`[aria-labelledby="${id}"]`);
      expect(region).not.toBeNull();
      expect(region.getAttribute("role")).toBe("region");
    }
  });

  it("renders the AI provider dropdown with all available providers", () => {
    const { container } = mountView();
    const select = container.querySelector(".settings-select");
    expect(select).not.toBeNull();
    const options = container.querySelectorAll(".settings-select option");
    expect(options.length).toBe(3);
    const values = Array.from(options).map((o) => o.getAttribute("value"));
    expect(values).toEqual(["claude", "openai", "gemini"]);
  });

  it("changing the AI provider dropdown calls setAiProvider and pushes a success toast", async () => {
    const { container } = mountView();
    const store = useLifeos();
    const toasts = useToasts();
    const spy = vi.spyOn(store, "setAiProvider");
    const before = toasts.items.length;

    const select = container.querySelector(".settings-select");
    await fireEvent.change(select, { target: { value: "openai" } });

    expect(spy).toHaveBeenCalledWith("openai");
    expect(toasts.items.length).toBe(before + 1);
    expect(toasts.items.at(-1).variant).toBe("success");
    expect(toasts.items.at(-1).message).toMatch(/openai/);
  });

  it("toggling the telemetry checkbox flips lifeos.telemetryEnabled", async () => {
    const { container } = mountView();
    const store = useLifeos();
    expect(store.telemetryEnabled).toBe(true);

    const toggle = container.querySelector(".settings-toggle");
    await fireEvent.change(toggle, { target: { checked: false } });
    expect(store.telemetryEnabled).toBe(false);

    await fireEvent.change(toggle, { target: { checked: true } });
    expect(store.telemetryEnabled).toBe(true);
  });

  it("changing the refresh-rate radio sets lifeos.telemetryRefreshMs", async () => {
    const { container } = mountView();
    const store = useLifeos();
    const radios = container.querySelectorAll('input[type="radio"][name="telemetry-refresh"]');
    expect(radios.length).toBe(3);

    // Pick the 5s option (third radio).
    await fireEvent.change(radios[2], { target: { checked: true } });
    expect(store.telemetryRefreshMs).toBe(5000);

    await fireEvent.change(radios[0], { target: { checked: true } });
    expect(store.telemetryRefreshMs).toBe(1000);
  });

  it("clicking Reset to defaults calls lifeos.resetUiState and pushes a toast", async () => {
    const { container } = mountView();
    const store = useLifeos();
    const toasts = useToasts();
    const spy = vi.spyOn(store, "resetUiState");
    const before = toasts.items.length;

    const resetBtn = Array.from(container.querySelectorAll(".settings-action"))
      .find((b) => b.textContent.includes("Reset to defaults"));
    expect(resetBtn).toBeTruthy();
    await fireEvent.click(resetBtn);

    expect(spy).toHaveBeenCalled();
    expect(toasts.items.length).toBe(before + 1);
  });

  it("clicking Open shortcut overlay dispatches a ? keydown to document.body", async () => {
    const { container } = mountView();
    const spy = vi.fn();
    const listener = (e) => { if (e.key === "?") spy(); };
    document.body.addEventListener("keydown", listener);

    const openBtn = Array.from(container.querySelectorAll(".settings-action"))
      .find((b) => b.textContent.includes("Open shortcut overlay"));
    expect(openBtn).toBeTruthy();
    await fireEvent.click(openBtn);

    expect(spy).toHaveBeenCalled();
    document.body.removeEventListener("keydown", listener);
  });

  it("About section renders the version triplet in web-preview mode when Tauri is absent", async () => {
    const { container } = mountView();
    await flushPromises();

    const rows = container.querySelector('[data-test="settings-about-meta"]').querySelectorAll(".settings-meta-row");
    expect(rows.length).toBe(3);
    const keys = Array.from(rows).map((r) => r.querySelector(".settings-meta-key").textContent.trim());
    expect(keys).toEqual(["App", "Tauri runtime", "Target"]);

    // Default placeholders should be in place since no Tauri host is set.
    const tauriRow = rows[1].querySelector(".settings-meta-value").textContent;
    const targetRow = rows[2].querySelector(".settings-meta-value").textContent;
    expect(tauriRow).toMatch(/web preview/i);
    expect(targetRow).toMatch(/web preview/i);
  });

  it("About section populates the version triplet from the app_version Tauri command", async () => {
    const invoke = vi.fn().mockResolvedValue({
      app: "0.9.0",
      tauri: "2.1.0",
      target_triple: "linux-x86_64",
    });
    setTauri(invoke);

    const { container } = mountView();
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("app_version");
    const rows = container.querySelector('[data-test="settings-about-meta"]').querySelectorAll(".settings-meta-row");
    const values = Array.from(rows).map((r) => r.querySelector(".settings-meta-value").textContent.trim());
    expect(values).toEqual(["0.9.0", "2.1.0", "linux-x86_64"]);
  });

  it("Account section renders displayName + email from the auth store and exposes sign-out", async () => {
    const { useAuth } = await import("@/stores/auth");
    const auth = useAuth();
    auth._resetFakeBackend();
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });

    const { container } = mountView();
    await flushPromises();

    expect(container.querySelector('[data-test="settings-account-name"]').textContent.trim()).toBe("Alex");
    expect(container.querySelector('[data-test="settings-account-email"]').textContent.trim()).toBe("alex@lifeos.ai");
    expect(container.querySelector('[data-test="settings-signout"]')).not.toBeNull();
  });

  it("clicking Sign out signs the user out via the auth store", async () => {
    const { useAuth } = await import("@/stores/auth");
    const auth = useAuth();
    auth._resetFakeBackend();
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
    expect(auth.isSignedIn).toBe(true);

    const { container } = mountView();
    await fireEvent.click(container.querySelector('[data-test="settings-signout"]'));
    await flushPromises();
    expect(auth.isSignedIn).toBe(false);
    expect(auth.status).toBe("signed_out");
  });
});
