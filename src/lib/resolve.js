// LifeOS — shared data resolver (JS sibling for browser preview)
// The .ts version exists for production type-checking; this file is what the runtime SFC loader fetches.

function W() { return window.LIFEOS_DATA; }
function A() { return window.LIFEOS_AGGREGATORS; }

export function resolveWorkspace(id) {
  if (!id) return null;
  const D = W();
  if (!D) return null;
  if (id === "settings") return D.profile || null;
  if (D.hubs?.[id]) return D.hubs[id];
  if (D.workspaces[id]) return D.workspaces[id];
  const footer = (D.railFooter || []).find(r => r.id === id);
  if (!footer) return null;
  const agg = A();
  if (!agg || typeof agg[id] !== "function") {
    return { title: footer.tooltip || id, sections: [{ title: "No data", items: [] }] };
  }
  const items = agg[id].call(agg);
  const groups = {};
  items.forEach(it => {
    const key = it._origin?.workspaceTitle || "Other";
    (groups[key] = groups[key] || []).push(it);
  });
  return {
    title: footer.tooltip?.split(" (")[0] || id,
    synced: true,
    sections: Object.keys(groups).map(title => ({ title, items: groups[title] })),
  };
}

export function flow(flowId) {
  return window.LIFEOS_FLOWS?.[flowId] || null;
}
