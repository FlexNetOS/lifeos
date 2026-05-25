// LifeOS — persistence plugin tests.
// Covers the four behaviors the persistence contract requires:
//   1. No-op in plain Vitest (window.__TAURI__ undefined) — store stays at defaults.
//   2. `ui_state_read` hydration merges whitelisted keys via $patch.
//   3. `ui_state_write` is called (debounced) after a state mutation.
//   4. Non-whitelisted keys are never sent to the write payload.
//
// IMPLEMENTATION NOTE — Pinia 2.x only flushes `pinia.use(plugin)` queued plugins
// once `app.use(pinia)` runs (see pinia.mjs install() / use()). A bare
// setActivePinia(pinia) keeps plugins parked in `toBeInstalled`. So each test
// creates a throwaway Vue app and runs `app.use(pinia)` before calling useLifeos().

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { createPinia } from "pinia";
import {
  tauriPersistence,
  LIFEOS_PERSIST_KEYS,
} from "@/lib/persistence.js";
import { useLifeos } from "@/stores/lifeos.js";

// Drain microtasks (promise-then chain inside the hydration flow).
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// Build a minimal Vue app, install a pinia with the persistence plugin, then
// return the activated store. Mirrors what main.ts does in production.
function bootWithPlugin(pluginOpts) {
  const pinia = createPinia();
  pinia.use(tauriPersistence(pluginOpts));
  const App = defineComponent({ render: () => h("div") });
  const app = createApp(App);
  app.use(pinia);
  // Activate the store — this is what triggers the plugin to run.
  const store = useLifeos(pinia);
  return { app, pinia, store };
}

describe("tauriPersistence — no Tauri host", () => {
  beforeEach(() => {
    delete window.__TAURI__;
  });

  it("does not throw and leaves the store at defaults", () => {
    const { store } = bootWithPlugin({ storeId: "lifeos", keys: LIFEOS_PERSIST_KEYS });

    // Default state preserved — plugin must not touch anything when invoke is absent.
    expect(store.activeId).toBe("ai");
    expect(store.wsCollapsed).toBe(false);
    expect(store.aiAvatarHidden).toBe(false);
  });
});

describe("tauriPersistence — under Tauri host", () => {
  let invoke;

  beforeEach(() => {
    invoke = vi.fn();
    window.__TAURI__ = { core: { invoke } };
  });

  afterEach(() => {
    delete window.__TAURI__;
  });

  it("hydrates whitelisted keys from ui_state_read", async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === "ui_state_read") {
        return Promise.resolve(
          JSON.stringify({
            activeId: "work",
            wsCollapsed: true,
            aiAvatarHidden: true,
            aiProvider: "openai",
            sectionByWs: { work: "Sales" },
            // Non-whitelisted noise — must NOT land in the store.
            cmdkOpen: true,
            aiMessages: [{ role: "ai", text: "stale" }],
          }),
        );
      }
      return Promise.resolve();
    });

    const { store } = bootWithPlugin({ storeId: "lifeos", keys: LIFEOS_PERSIST_KEYS });

    // Drain the hydrate promise chain.
    await flushMicrotasks();

    expect(invoke).toHaveBeenCalledWith("ui_state_read");
    expect(store.activeId).toBe("work");
    expect(store.wsCollapsed).toBe(true);
    expect(store.aiAvatarHidden).toBe(true);
    expect(store.aiProvider).toBe("openai");
    expect(store.sectionByWs).toEqual({ work: "Sales" });
    // Non-whitelisted keys must remain at their defaults.
    expect(store.cmdkOpen).toBe(false);
    expect(store.aiMessages[0].text).toBe("Hey, Alex. I'm here. What do you need?");
  });

  it("debounce-writes via ui_state_write after a state mutation", async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === "ui_state_read") return Promise.resolve("{}");
      return Promise.resolve();
    });

    // Tight debounce keeps the spec fast while still exercising the debounce path.
    const { store } = bootWithPlugin({ storeId: "lifeos", keys: LIFEOS_PERSIST_KEYS, debounceMs: 10 });

    // Let hydration settle so its $patch doesn't get counted as a write trigger.
    await flushMicrotasks();
    invoke.mockClear();

    store.pickWorkspace("home");
    await nextTick(); // flush Vue scheduler so $subscribe callback runs

    // Pre-debounce: nothing written yet.
    expect(invoke).not.toHaveBeenCalledWith("ui_state_write", expect.anything());

    // Wait past the debounce window.
    await new Promise((r) => setTimeout(r, 30));

    const writeCalls = invoke.mock.calls.filter((c) => c[0] === "ui_state_write");
    expect(writeCalls.length).toBe(1);
    const payload = JSON.parse(writeCalls[0][1].state);
    expect(payload.activeId).toBe("home");
  });

  it("never sends non-whitelisted keys to ui_state_write", async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === "ui_state_read") return Promise.resolve("{}");
      return Promise.resolve();
    });

    const { store } = bootWithPlugin({ storeId: "lifeos", keys: LIFEOS_PERSIST_KEYS, debounceMs: 10 });

    await flushMicrotasks();
    invoke.mockClear();

    // Mutate a whitelisted key AND a non-whitelisted one in the same tick.
    store.pickWorkspace("home");
    store.sendAiMessage("hello");   // pushes to aiMessages (non-whitelisted)
    store.openCmdk("seed");         // flips cmdkOpen + cmdkSeed (non-whitelisted)
    await nextTick();
    await new Promise((r) => setTimeout(r, 30));

    const writeCalls = invoke.mock.calls.filter((c) => c[0] === "ui_state_write");
    expect(writeCalls.length).toBeGreaterThanOrEqual(1);
    const payload = JSON.parse(writeCalls.at(-1)[1].state);

    // Whitelisted keys present.
    expect(payload).toHaveProperty("activeId");
    expect(payload).toHaveProperty("wsCollapsed");

    // Non-whitelisted keys ABSENT.
    expect(payload).not.toHaveProperty("aiMessages");
    expect(payload).not.toHaveProperty("cmdkOpen");
    expect(payload).not.toHaveProperty("cmdkSeed");
    expect(payload).not.toHaveProperty("pendingExpand");
    expect(payload).not.toHaveProperty("activeSub");
    expect(payload).not.toHaveProperty("extraItems");
    expect(payload).not.toHaveProperty("extraSections");
  });
});

describe("persistence sibling parity — persistence.js ↔ persistence.ts", () => {
  it("export the same whitelist of keys (.js ↔ .ts)", async () => {
    const js = await import("@/lib/persistence.js");
    const ts = await import("@/lib/persistence.ts");
    expect(ts.LIFEOS_PERSIST_KEYS).toEqual(js.LIFEOS_PERSIST_KEYS);
    expect(typeof ts.tauriPersistence).toBe("function");
    expect(typeof js.tauriPersistence).toBe("function");
  });
});
