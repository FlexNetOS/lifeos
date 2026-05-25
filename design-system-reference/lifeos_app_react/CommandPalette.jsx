// LifeOS — Command Palette
// Cmd-K / Ctrl-K opens a fuzzy-search across all workspaces, sections, items, and teams.
// Selection routes via the same handlers as rail/dashboard clicks.

const { useState, useEffect, useRef, useMemo } = React;

// Lightweight scoring: prefix > substring > char-sequence match. No external lib.
function scoreMatch(query, target) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500 + (q.length / t.length) * 100;
  const idx = t.indexOf(q);
  if (idx >= 0) return 250 - idx;
  // char-sequence
  let ti = 0, hits = 0, lastIdx = -1, runs = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    for (let i = ti; i < t.length; i++) {
      if (t[i] === ch) { found = i; break; }
    }
    if (found < 0) return 0;
    if (found === lastIdx + 1) runs++;
    lastIdx = found;
    ti = found + 1;
    hits++;
  }
  return hits === q.length ? 50 + runs * 5 : 0;
}

function indexAll() {
  const D = window.LIFEOS_DATA;
  if (!D) return [];
  const out = [];
  // Workspaces
  (D.rail || []).concat(D.railFooter || []).forEach((r) => {
    const ws = r.id === "settings" ? D.profile : D.workspaces[r.id];
    if (!ws) {
      // footer aggregator — index just the entry itself
      out.push({ kind: "workspace", id: r.id, icon: r.icon, label: r.tooltip?.split(" (")[0] || r.id, hint: r.tooltip || "", route: { workspaceId: r.id } });
      return;
    }
    out.push({ kind: "workspace", id: r.id, icon: r.icon, label: ws.title, hint: r.tooltip || "", route: { workspaceId: r.id } });
    (ws.sections || []).forEach((s) => {
      out.push({ kind: "section", id: `${r.id}/${s.title}`, icon: s.items?.[0]?.icon || "list", label: s.title, hint: ws.title, route: { workspaceId: r.id, sectionTitle: s.title } });
      (s.items || []).forEach((item) => {
        out.push({ kind: "item", id: `${r.id}/${s.title}/${item.label}`, icon: item.icon || "circle", label: item.label, hint: `${ws.title} · ${s.title}${item.meta ? " · " + item.meta : ""}`, route: { workspaceId: r.id, sectionTitle: s.title, item } });
      });
    });
  });
  // Agent teams (flow shortcuts)
  (D.dashboardCanvas?.teams || []).forEach((t) => {
    out.push({ kind: "team", id: `team/${t.id}`, icon: t.icon, label: t.name, hint: `Agent team · ${t.meta}`, route: { team: t } });
  });
  return out;
}

const KIND_LABEL = { workspace: "Workspace", section: "Section", item: "Item", team: "Team" };
const KIND_TONE  = { workspace: "cyan",      section: "purple",  item: "neutral", team: "green" };

const CommandPalette = ({ open, onClose, onNavigate, onJumpToTeam }) => {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const corpus = useMemo(() => indexAll(), [open]); // re-index on open
  const max = 60;

  const results = useMemo(() => {
    if (!q.trim()) {
      // Default: top workspaces + teams when no query
      const ws = corpus.filter(r => r.kind === "workspace").slice(0, 8);
      const teams = corpus.filter(r => r.kind === "team");
      return [...ws, ...teams];
    }
    const scored = corpus.map((r) => {
      const s = Math.max(
        scoreMatch(q, r.label) * 1.2,
        scoreMatch(q, r.hint || "") * 0.6
      );
      return { r, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max);
    return scored.map(x => x.r);
  }, [q, corpus]);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  // Keep active visible
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-row-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const pick = (r) => {
    onClose();
    if (r.kind === "team") {
      onJumpToTeam?.(r.route.team);
      return;
    }
    onNavigate?.(r.route);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) pick(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="cmdk-panel">
        <div className="cmdk-input-wrap">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Jump to workspace · section · item · team…"
            aria-label="Search LifeOS"
            aria-controls="cmdk-results"
            aria-activedescendant={`cmdk-row-${active}`}
          />
          <Kbd>ESC</Kbd>
        </div>
        <div className="cmdk-results" id="cmdk-results" ref={listRef} role="listbox">
          {results.length === 0 && (
            <div className="cmdk-empty"><Icon name="sparkles" size={14} /> No matches. Try a workspace, section, or team name.</div>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              id={`cmdk-row-${i}`}
              data-row-idx={i}
              className={`cmdk-row ${i === active ? "active" : ""}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
            >
              <span className={`cmdk-ico tone-${KIND_TONE[r.kind] || "neutral"}`}>
                <Icon name={r.icon || "circle"} size={14} />
              </span>
              <span className="cmdk-body">
                <span className="cmdk-label">{r.label}</span>
                {r.hint && <span className="cmdk-hint">{r.hint}</span>}
              </span>
              <span className="cmdk-kind">{KIND_LABEL[r.kind]}</span>
            </button>
          ))}
        </div>
        <div className="cmdk-footer">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span><Kbd>↵</Kbd> open</span>
          <span><Kbd>ESC</Kbd> close</span>
          <span className="cmdk-count">{results.length} results</span>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { CommandPalette });
