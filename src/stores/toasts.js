// LifeOS — Toasts store (JS sibling for browser preview)
// Surface MUST match src/stores/toasts.ts — store-sync.spec.js asserts parity.

import { defineStore } from "pinia";

// Timer handles live outside Pinia state so $state stays serializable and
// the store-sync parity test only sees `items` as the sole state key.
const _timers = new Map();
let _seq = 0;

export const useToasts = defineStore("toasts", {
  state: () => ({
    items: [],
  }),
  actions: {
    push({ message, variant }) {
      const id = `t-${Date.now()}-${++_seq}`;
      this.items = [...this.items, { id, message, variant, createdAt: Date.now() }];
      const timer = setTimeout(() => this.dismiss(id), 3500);
      _timers.set(id, timer);
      return id;
    },
    dismiss(id) {
      const timer = _timers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        _timers.delete(id);
      }
      this.items = this.items.filter((t) => t.id !== id);
    },
    clear() {
      for (const [, timer] of _timers) clearTimeout(timer);
      _timers.clear();
      this.items = [];
    },
    pauseTimer(id) {
      const timer = _timers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        _timers.delete(id);
      }
    },
    resumeTimer(id) {
      if (_timers.has(id)) return; // already running
      const item = this.items.find((t) => t.id === id);
      if (!item) return;
      const timer = setTimeout(() => this.dismiss(id), 3500);
      _timers.set(id, timer);
    },
    info(message) {
      return this.push({ message, variant: "info" });
    },
    success(message) {
      return this.push({ message, variant: "success" });
    },
    warn(message) {
      return this.push({ message, variant: "warn" });
    },
    error(message) {
      return this.push({ message, variant: "error" });
    },
  },
});
