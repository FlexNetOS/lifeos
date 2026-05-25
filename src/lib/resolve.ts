// LifeOS — shared data resolver (Vue side)
// Mirrors window.resolveWorkspace from the React canon, exposed as ES module.

export interface OriginTag {
  workspaceId: string;
  workspaceTitle: string;
  section: string;
}

export interface Item {
  icon?: string;
  label: string;
  meta?: string;
  status?: "online" | "good" | "warn" | "err" | "offline" | string;
  badge?: { count?: number; tone?: "info" | "warn" | "err" | "ok" };
  active?: boolean;
  shortcut?: string;
  view?: "n8n-flow";
  flowId?: string;
  _origin?: OriginTag;
  children?: Item[];
}
export interface Section { title: string; items: Item[]; }
export interface Workspace { title: string; badge?: any; synced?: boolean; sections: Section[]; }

// Pull from window (set by data.js script-tag, identical contract to React kit)
function W() { return (window as any).LIFEOS_DATA; }
function A() { return (window as any).LIFEOS_AGGREGATORS; }

export function resolveWorkspace(id: string | null | undefined): Workspace | null {
  if (!id) return null;
  const D = W();
  if (!D) return null;
  if (id === "settings") return D.profile || null;
  if (D.workspaces[id]) return D.workspaces[id];

  // footer aggregator?
  const footer = (D.railFooter || []).find((r: any) => r.id === id);
  if (!footer) return null;
  const agg = A();
  if (!agg || typeof agg[id] !== "function") {
    return { title: footer.tooltip || id, sections: [{ title: "No data", items: [] }] };
  }
  const items: Item[] = agg[id].call(agg);
  const groups: Record<string, Item[]> = {};
  items.forEach((it) => {
    const key = it._origin?.workspaceTitle || "Other";
    (groups[key] = groups[key] || []).push(it);
  });
  return {
    title: footer.tooltip?.split(" (")[0] || id,
    synced: true,
    sections: Object.keys(groups).map((title) => ({ title, items: groups[title] })),
  };
}

export function flow(flowId: string) {
  return (window as any).LIFEOS_FLOWS?.[flowId] || null;
}
