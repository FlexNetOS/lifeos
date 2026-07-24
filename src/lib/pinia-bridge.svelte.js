// LifeOS — Pinia → Svelte reactivity bridge (Svelte-only; see AGENTS.md/CLAUDE.md
// Svelte-migration notes for the full "approach_notes" writeup).
//
// Why this exists: Pinia stores are plain Vue-reactive singletons keyed by store id.
// useLifeos()/useAuth() work with ZERO Vue component tree — defineStore()'s returned
// useStore() falls back to the globally active Pinia instance (set once via
// setActivePinia()) whenever there's no Vue component injection context to read from.
// That means a Svelte component can import and call the *exact same* store the Vue
// app uses — one source of truth, no duplicated/forked state, no store rewrite.
//
// The one thing Svelte can't do on its own is *notice* a Vue-reactive value changing —
// Svelte 5's runes only track $state/$derived reads. This bridge uses Vue's own
// `watch()` (works standalone, no component required) to observe exactly the store
// keys a component cares about, and mirrors them into a Svelte $state object that the
// template reads instead of the store directly. Actions are called directly on the
// store instance (they're plain, stable functions — no bridging needed for writes).
//
// Two hardening rules, both load-bearing:
//
// 1. Values are mirrored RAW (Vue's toRaw), never as live Vue proxies. Nesting a
//    Vue-reactive array inside a Svelte $state proxy sends Vue's instrumented
//    Array.prototype.includes/indexOf into infinite recursion (searchProxy retries
//    the lookup through the Svelte proxy's `get`, which hands back the instrumented
//    method again — RangeError: Maximum call stack size exceeded; first hit by
//    NotificationsDrawer's `readNotificationIds.includes(id)`). Raw object graphs
//    carry no Vue instrumentation, so array methods behave normally under Svelte's
//    own proxy.
//
// 2. The watcher is `deep`, and arrays are re-mirrored as fresh shallow copies.
//    A getter source like `() => store.aiMessages` only tracks the property
//    reference, and the store appends chat messages with an in-place push — without
//    `deep: true` the push never fires the watcher, and without the copy the
//    re-assigned raw array is reference-equal so Svelte's signal never invalidates.
//    Store keys that are replaced immutably (the majority) behave identically
//    either way.
import { watch, toRaw } from "vue";
import { onDestroy } from "svelte";

function mirror(value) {
  const raw = toRaw(value);
  return Array.isArray(raw) ? [...raw] : raw;
}

/**
 * Mirror a set of Pinia store state fields / getters into a Svelte $state object
 * that stays in sync with the live store, and clean up the Vue watcher on
 * component destroy.
 *
 * @param {object} store - a Pinia store instance (e.g. useLifeos())
 * @param {string[]} keys - top-level state/getter keys this component reads
 * @returns {object} a Svelte $state-tracked snapshot, updated on every change
 */
export function bindStore(store, keys) {
  const snap = $state(Object.fromEntries(keys.map((k) => [k, mirror(store[k])])));
  const stop = watch(
    keys.map((k) => () => store[k]),
    () => {
      for (const k of keys) snap[k] = mirror(store[k]);
    },
    { flush: "sync", deep: true },
  );
  onDestroy(stop);
  return snap;
}
