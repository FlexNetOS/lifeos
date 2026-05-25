// LifeOS — Toasts store (typed)
// Surface MUST match src/stores/toasts.js — a sync test in tests/store-sync.spec.js
// asserts state-key + action-name parity. The JS sibling exists for the in-browser
// SFC-loader preview path; this TS file is the canonical typed source.

import { defineStore } from "pinia";

export type ToastVariant = "info" | "success" | "warn" | "error";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
}

export interface ToastsState {
  items: ToastItem[];
}

// Timer handles live outside Pinia state so $state stays serializable and
// the store-sync parity test only sees `items` as the sole state key.
const _timers = new Map<string, ReturnType<typeof setTimeout>>();
let _seq = 0;

export const useToasts = defineStore("toasts", {
  state: (): ToastsState => ({
    items: [],
  }),
  actions: {
    push({ message, variant }: { message: string; variant: ToastVariant }): string {
      const id = `t-${Date.now()}-${++_seq}`;
      this.items = [...this.items, { id, message, variant, createdAt: Date.now() }];
      const timer = setTimeout(() => this.dismiss(id), 3500);
      _timers.set(id, timer);
      return id;
    },
    dismiss(id: string) {
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
    pauseTimer(id: string) {
      const timer = _timers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        _timers.delete(id);
      }
    },
    resumeTimer(id: string) {
      if (_timers.has(id)) return; // already running
      const item = this.items.find((t) => t.id === id);
      if (!item) return;
      const timer = setTimeout(() => this.dismiss(id), 3500);
      _timers.set(id, timer);
    },
    info(message: string): string {
      return this.push({ message, variant: "info" });
    },
    success(message: string): string {
      return this.push({ message, variant: "success" });
    },
    warn(message: string): string {
      return this.push({ message, variant: "warn" });
    },
    error(message: string): string {
      return this.push({ message, variant: "error" });
    },
  },
});
