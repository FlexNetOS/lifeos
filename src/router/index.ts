// LifeOS — native hash router for the Svelte Glass shell.
//
// The browser-preview nav composables retain their vue-router sibling, but the
// mounted Tauri/Svelte runtime needs only a small URL/state bridge. Keeping that
// bridge native removes Vue reactivity from the live entrypoint while preserving
// the established route contract.

import { resolveWorkspace } from "@/lib/resolve";
import { useLifeos } from "@/stores/lifeos-native";

export interface LifeosRoute {
  path: string;
  name: "workspace" | "settings";
  params: Record<string, string | undefined>;
}

type NavigationHook = (route: LifeosRoute) => void | boolean | Promise<void | boolean>;

function readPath(): string {
  if (typeof window === "undefined") return "/workspace/ai";
  const hash = window.location.hash.replace(/^#/, "");
  return hash || "/workspace/ai";
}

function decode(value: string | undefined): string | undefined {
  return value ? decodeURIComponent(value) : undefined;
}

function parseRoute(path: string): LifeosRoute {
  const clean = path.split(/[?#]/, 1)[0] || "/workspace/ai";
  const parts = clean.split("/").filter(Boolean);
  if (parts[0] === "settings") {
    return {
      path: clean,
      name: "settings",
      params: { section: decode(parts[1]), sub: decode(parts[2]) },
    };
  }
  return {
    path: clean,
    name: "workspace",
    params: {
      id: decode(parts[1]) || "ai",
      section: decode(parts[2]),
      sub: decode(parts[3]),
    },
  };
}

function syncStore(route: LifeosRoute) {
  const lifeos = useLifeos();
  const id = route.name === "settings" ? "settings" : route.params.id || "ai";
  const sectionTitle = route.params.section;
  const subLabel = route.params.sub;
  let item: any;

  if (subLabel) {
    const workspace = resolveWorkspace(id);
    const section = workspace?.sections?.find(
      (candidate: any) => candidate.title === sectionTitle || (!sectionTitle && candidate.title === lifeos.currentSection),
    );
    item = section?.items?.find((candidate: any) => candidate.label === subLabel);
  }

  lifeos.syncRoute(id, sectionTitle, item);
}

class NativeRouter {
  readonly options: { history: { location: string } };
  readonly currentRoute: { value: LifeosRoute };
  private readonly hooks: NavigationHook[] = [];
  private ready: Promise<void> = Promise.resolve();

  constructor() {
    const path = readPath();
    this.options = { history: { location: path } };
    this.currentRoute = { value: parseRoute(path) };
    if (typeof window !== "undefined") {
      window.addEventListener("hashchange", () => {
        void this.navigate(readPath(), false);
      });
      window.addEventListener("popstate", () => {
        void this.navigate(readPath(), false);
      });
    }
  }

  beforeEach(hook: NavigationHook) {
    this.hooks.push(hook);
    return () => {
      const index = this.hooks.indexOf(hook);
      if (index >= 0) this.hooks.splice(index, 1);
    };
  }

  isReady(): Promise<void> { return this.ready; }

  push(path: string): Promise<void> {
    return this.navigate(path, true);
  }

  replace(path: string): Promise<void> {
    return this.navigate(path, false, true);
  }

  private async navigate(rawPath: string, writeHistory: boolean, replace = false): Promise<void> {
    const requested = rawPath || "/workspace/ai";
    const path = requested === "/" ? "/workspace/ai" : requested;
    const route = parseRoute(path);
    for (const hook of this.hooks) {
      const result = await hook(route);
      if (result === false) return;
    }
    this.currentRoute.value = route;
    this.options.history.location = route.path;
    syncStore(route);
    if (writeHistory && typeof window !== "undefined") {
      const nextHash = `#${route.path}`;
      if (replace) window.history.replaceState(null, "", nextHash);
      else if (window.location.hash !== nextHash) window.history.pushState(null, "", nextHash);
    }
  }
}

export const router = new NativeRouter();
