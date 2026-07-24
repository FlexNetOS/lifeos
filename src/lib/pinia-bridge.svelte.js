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
import { watch } from "vue";
import { onDestroy } from "svelte";

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
  const snap = $state(Object.fromEntries(keys.map((k) => [k, store[k]])));
  const stop = watch(
    keys.map((k) => () => store[k]),
    () => {
      for (const k of keys) snap[k] = store[k];
    },
    { flush: "sync" },
  );
  onDestroy(stop);
  return snap;
}
