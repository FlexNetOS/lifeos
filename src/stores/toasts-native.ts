// LifeOS — native Svelte toast store.
// The Pinia siblings remain the legacy preview contract; Svelte runtime surfaces
// use this subscribable store so the Glass shell no longer depends on Vue for UI
// notifications.

export type ToastVariant = "info" | "success" | "warn" | "error";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
}

export interface ToastsSnapshot {
  items: ToastItem[];
}

type Subscriber = (snapshot: ToastsSnapshot) => void;

export class NativeToastsStore {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly subscribers = new Set<Subscriber>();
  private sequence = 0;
  private state: ToastsSnapshot = { items: [] };

  get items(): ToastItem[] {
    return this.state.items;
  }

  subscribe(run: Subscriber): () => void {
    run(this.snapshot());
    this.subscribers.add(run);
    return () => this.subscribers.delete(run);
  }

  private snapshot(): ToastsSnapshot {
    return { items: this.state.items };
  }

  private emit() {
    const snapshot = this.snapshot();
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }

  push({ message, variant }: { message: string; variant: ToastVariant }): string {
    const id = `t-${Date.now()}-${++this.sequence}`;
    this.state = {
      items: [...this.state.items, { id, message, variant, createdAt: Date.now() }],
    };
    this.emit();
    this.timers.set(id, setTimeout(() => this.dismiss(id), 3500));
    return id;
  }

  dismiss(id: string) {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.state = { items: this.state.items.filter((item) => item.id !== id) };
    this.emit();
  }

  clear() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.state = { items: [] };
    this.emit();
  }

  pauseTimer(id: string) {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  resumeTimer(id: string) {
    if (this.timers.has(id)) return;
    if (!this.state.items.some((item) => item.id === id)) return;
    this.timers.set(id, setTimeout(() => this.dismiss(id), 3500));
  }

  info(message: string): string {
    return this.push({ message, variant: "info" });
  }

  success(message: string): string {
    return this.push({ message, variant: "success" });
  }

  warn(message: string): string {
    return this.push({ message, variant: "warn" });
  }

  error(message: string): string {
    return this.push({ message, variant: "error" });
  }
}

const toasts = new NativeToastsStore();

export function useToasts(): NativeToastsStore {
  return toasts;
}
