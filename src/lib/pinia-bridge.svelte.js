// LifeOS — store → Svelte bridge.
// Native stores expose subscribe() and are the Glass runtime path. A small
// $subscribe fallback keeps legacy Pinia preview fixtures usable without
// importing Vue into the mounted Svelte shell.
//
import { onDestroy } from "svelte";

function mirror(value) {
  return Array.isArray(value) ? [...value] : value;
}

/**
 * Mirror a set of store state fields / getters into a Svelte $state object
 * that stays in sync with the live store, and clean up the Vue watcher on
 * component destroy.
 *
 * @param {object} store - a native store or legacy Pinia store instance
 * @param {string[]} keys - top-level state/getter keys this component reads
 * @returns {object} a Svelte $state-tracked snapshot, updated on every change
 */
export function bindStore(store, keys) {
  const snap = $state(Object.fromEntries(keys.map((k) => [k, mirror(store[k])])));
  if (typeof store.subscribe === "function") {
    const stop = store.subscribe((value) => {
      for (const k of keys) snap[k] = mirror(value[k]);
    });
    onDestroy(stop);
    return snap;
  }
  if (typeof store.$subscribe === "function") {
    const stop = store.$subscribe(() => {
      for (const k of keys) snap[k] = mirror(store[k]);
    }, { detached: true });
    onDestroy(stop);
  }
  return snap;
}
