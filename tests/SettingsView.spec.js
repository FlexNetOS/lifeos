// LifeOS — SettingsView SFC tests.
// Covers: four sections render with role=region + aria-labelledby, the AI provider
// dropdown wires through to setAiProvider + toasts, the telemetry toggle flips the
// store, the refresh-rate radio sets the store, the reset button calls
// resetUiState, and the About card renders the version triplet (web preview).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SettingsView from "@/components/SettingsView.vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useToasts } from "@/stores/toasts.js";

const setTauri = (invoke) => {
  if (invoke) window.__TAURI__ = { core: { invoke } };
  else delete window.__TAURI__;
};

describe("SettingsView.vue", () => {
  let pinia;

  beforeEach(() => {
    setTauri(null);
    pinia = createPinia();
    setActivePinia(pinia);
  });

  afterEach(() => {
    setTauri(null);
  });

  const mountView = () => mount(SettingsView, { global: { plugins: [pinia] } });

  it("mounts cleanly with the canvas root + section regions", () => {
    const w = mountView();
    expect(w.find(".settings-canvas").exists()).toBe(true);
    const regions = w.findAll('[role="region"]');
    // 1 canvas region + 5 settings-section regions in the main column
    // (Account, AI, Telemetry, Appearance, About) + 2 side-card regions.
    const settingsSections = w.findAll(".settings-section");
    expect(settingsSections.length).toBe(7);
    expect(regions.length).toBeGreaterThanOrEqual(8);
  });

  it("each settings section in the main column has aria-labelledby pointing to its heading", () => {
    const w = mountView();
    const ids = [
      "settings-account-heading",
      "settings-ai-heading",
      "settings-telemetry-heading",
      "settings-appearance-heading",
      "settings-about-heading",
    ];
    for (const id of ids) {
      const heading = w.find(`#${id}`);
      expect(heading.exists()).toBe(true);
      const region = w.find(`[aria-labelledby="${id}"]`);
      expect(region.exists()).toBe(true);
      expect(region.attributes("role")).toBe("region");
    }
  });

  it("renders the AI provider dropdown with all available providers", () => {
    const w = mountView();
    const select = w.find(".settings-select");
    expect(select.exists()).toBe(true);
    const options = w.findAll(".settings-select option");
    expect(options.length).toBe(3);
    const values = options.map((o) => o.attributes("value"));
    expect(values).toEqual(["claude", "openai", "gemini"]);
  });

  it("changing the AI provider dropdown calls setAiProvider and pushes a success toast", async () => {
    const w = mountView();
    const store = useLifeos();
    const toasts = useToasts();
    const spy = vi.spyOn(store, "setAiProvider");
    const before = toasts.items.length;

    const select = w.find(".settings-select");
    await select.setValue("openai");

    expect(spy).toHaveBeenCalledWith("openai");
    expect(toasts.items.length).toBe(before + 1);
    expect(toasts.items.at(-1).variant).toBe("success");
    expect(toasts.items.at(-1).message).toMatch(/openai/);
  });

  it("toggling the telemetry checkbox flips lifeos.telemetryEnabled", async () => {
    const w = mountView();
    const store = useLifeos();
    expect(store.telemetryEnabled).toBe(true);

    const toggle = w.find(".settings-toggle");
    await toggle.setValue(false);
    expect(store.telemetryEnabled).toBe(false);

    await toggle.setValue(true);
    expect(store.telemetryEnabled).toBe(true);
  });

  it("changing the refresh-rate radio sets lifeos.telemetryRefreshMs", async () => {
    const w = mountView();
    const store = useLifeos();
    const radios = w.findAll('input[type="radio"][name="telemetry-refresh"]');
    expect(radios.length).toBe(3);

    // Pick the 5s option (third radio).
    await radios[2].setValue();
    expect(store.telemetryRefreshMs).toBe(5000);

    await radios[0].setValue();
    expect(store.telemetryRefreshMs).toBe(1000);
  });

  it("clicking Reset to defaults calls lifeos.resetUiState and pushes a toast", async () => {
    const w = mountView();
    const store = useLifeos();
    const toasts = useToasts();
    const spy = vi.spyOn(store, "resetUiState");
    const before = toasts.items.length;

    const resetBtn = w
      .findAll(".settings-action")
      .find((b) => b.text().includes("Reset to defaults"));
    expect(resetBtn).toBeTruthy();
    await resetBtn.trigger("click");

    expect(spy).toHaveBeenCalled();
    expect(toasts.items.length).toBe(before + 1);
  });

  it("clicking Open shortcut overlay dispatches a ? keydown to document.body", async () => {
    const w = mountView();
    const spy = vi.fn();
    const listener = (e) => { if (e.key === "?") spy(); };
    document.body.addEventListener("keydown", listener);

    const openBtn = w
      .findAll(".settings-action")
      .find((b) => b.text().includes("Open shortcut overlay"));
    expect(openBtn).toBeTruthy();
    await openBtn.trigger("click");

    expect(spy).toHaveBeenCalled();
    document.body.removeEventListener("keydown", listener);
  });

  it("About section renders the version triplet in web-preview mode when Tauri is absent", async () => {
    const w = mountView();
    await flushPromises();

    const rows = w.find('[data-test="settings-about-meta"]').findAll(".settings-meta-row");
    expect(rows.length).toBe(3);
    const keys = rows.map((r) => r.find(".settings-meta-key").text());
    expect(keys).toEqual(["App", "Tauri runtime", "Target"]);

    // Default placeholders should be in place since no Tauri host is set.
    const tauriRow = rows[1].find(".settings-meta-value").text();
    const targetRow = rows[2].find(".settings-meta-value").text();
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

    const w = mountView();
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("app_version");
    const rows = w.find('[data-test="settings-about-meta"]').findAll(".settings-meta-row");
    const values = rows.map((r) => r.find(".settings-meta-value").text());
    expect(values).toEqual(["0.9.0", "2.1.0", "linux-x86_64"]);
  });

  it("Account section renders displayName + email from the auth store and exposes sign-out", async () => {
    const { useAuth } = await import("@/stores/auth");
    const auth = useAuth();
    auth._resetFakeBackend();
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });

    const w = mountView();
    await flushPromises();

    expect(w.find('[data-test="settings-account-name"]').text()).toBe("Alex");
    expect(w.find('[data-test="settings-account-email"]').text()).toBe("alex@lifeos.ai");
    expect(w.find('[data-test="settings-signout"]').exists()).toBe(true);
  });

  it("clicking Sign out signs the user out via the auth store", async () => {
    const { useAuth } = await import("@/stores/auth");
    const auth = useAuth();
    auth._resetFakeBackend();
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
    expect(auth.isSignedIn).toBe(true);

    const w = mountView();
    await w.find('[data-test="settings-signout"]').trigger("click");
    await flushPromises();
    expect(auth.isSignedIn).toBe(false);
    expect(auth.status).toBe("signed_out");
  });
});
