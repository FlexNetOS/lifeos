// Top-level shell + SubsectionView + N8nFlowView

const App = () => {
  const [activeId, setActiveId] = useState("ai");
  const [wsCollapsed, setWsCollapsed] = useState(false);
  const [pendingExpand, setPendingExpand] = useState(null);
  const [sectionByWs, setSectionByWs] = useState({});
  const [activeSub, setActiveSub] = useState(null);
  const [cmdkOpen, setCmdkOpen] = useState(false);

  const ws = window.resolveWorkspace ? window.resolveWorkspace(activeId) : null;
  const currentSection = sectionByWs[activeId] || ws?.sections?.[0]?.title;

  const pickWorkspace = (id) => { setActiveId(id); setWsCollapsed(false); setActiveSub(null); };
  const pickSection = (sectionTitle) => {
    setSectionByWs(prev => ({ ...prev, [activeId]: sectionTitle }));
    setActiveSub(null);
  };
  const pickSub = (item, sectionTitle) => setActiveSub({ workspaceId: activeId, sectionTitle, item });
  const clearSub = () => setActiveSub(null);

  const jumpToTeam = (teamItem) => {
    setActiveId("ai");
    setWsCollapsed(false);
    setSectionByWs(prev => ({ ...prev, ai: "Agent Teams" }));
    setActiveSub({ workspaceId: "ai", sectionTitle: "Agent Teams", item: teamItem });
    setPendingExpand(`Agent Teams-${teamItem._teamIndex ?? 0}`);
  };

  // Global ⌘K / Ctrl-K to open command palette
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cmdkNavigate = (route) => {
    if (route.workspaceId) setActiveId(route.workspaceId);
    setWsCollapsed(false);
    if (route.sectionTitle) {
      setSectionByWs((prev) => ({ ...prev, [route.workspaceId]: route.sectionTitle }));
    } else {
      setActiveSub(null);
    }
    if (route.item) {
      setActiveSub({ workspaceId: route.workspaceId, sectionTitle: route.sectionTitle, item: route.item });
    } else if (route.sectionTitle) {
      setActiveSub(null);
    }
  };

  return (
    <div className={`shell ${wsCollapsed ? "ws-collapsed" : ""}`}>
      <Sidebar activeId={activeId} onSelect={pickWorkspace}
               wsCollapsed={wsCollapsed}
               onToggleWs={() => setWsCollapsed(c => !c)}
               onOpenCmdK={() => setCmdkOpen(true)} />
      <Workspace workspaceId={activeId}
                 currentSection={currentSection}
                 onSelectSection={pickSection}
                 activeSub={activeSub}
                 onSelectSub={pickSub}
                 onSelect={pickWorkspace}
                 collapsed={wsCollapsed}
                 onToggleCollapsed={() => setWsCollapsed(c => !c)}
                 pendingExpand={pendingExpand}
                 onConsumeExpand={() => setPendingExpand(null)} />
      <main className="main" id="main" tabIndex="-1">
        {activeSub
          ? (activeSub.item?.view === "n8n-flow"
              ? <N8nFlowView sub={activeSub} onBack={clearSub} />
              : <SubsectionView sub={activeSub} onBack={clearSub} />)
          : <Dashboard onSelectWorkspace={pickWorkspace}
                       onJumpToTeam={jumpToTeam} />}
      </main>
      <CommandPalette open={cmdkOpen}
                      onClose={() => setCmdkOpen(false)}
                      onNavigate={cmdkNavigate}
                      onJumpToTeam={jumpToTeam} />
    </div>
  );
};

// ----- SUBSECTION DETAIL ----------------------------------------------------
const SubsectionView = ({ sub, onBack }) => {
  const { workspaceId, sectionTitle, item } = sub;
  const ws = window.resolveWorkspace ? window.resolveWorkspace(workspaceId) : null;
  return (
    <div className="canvas sub-canvas">
      <header className="sub-head">
        <button className="sub-back" onClick={onBack} title="Back to dashboard" aria-label="Back to dashboard">
          <Icon name="arrow-left" size={14} /> Dashboard
        </button>
        <div className="sub-breadcrumb">
          <span>{ws?.title}</span>
          <Icon name="chevron-right" size={12} />
          <span>{sectionTitle}</span>
          <Icon name="chevron-right" size={12} />
          <strong>{item.label}</strong>
        </div>
      </header>
      <section className="sub-hero">
        <div className="sub-hero-ico"><Icon name={item.icon || "circle"} size={28} /></div>
        <div>
          <h1>{item.label}</h1>
          {item.meta && <p className="sub-hero-meta">{item.meta}</p>}
        </div>
        {item.badge && (
          <span className={`sub-hero-badge tone-${item.badge.tone || "err"}`}>
            {item.badge.count > 99 ? "99+" : item.badge.count} new
          </span>
        )}
      </section>
      {item.children && item.children.length > 0 ? (
        <div className="sub-children-grid">
          {item.children.map((c, i) => {
            const tone = c.status === "warn" ? "warn" : (c.status === "good" || c.status === "online") ? "ok" : "neutral";
            const t = (window.TONE && window.TONE[tone]) || { bg: "var(--bg-3)", fg: "var(--fg-1)", bd: "var(--bg-4)" };
            return (
              <div key={i} className="sub-child-card" style={{ borderColor: t.bd, animationDelay: `${i * 40}ms` }}>
                <div className="sub-child-dot" style={{ background: t.fg, boxShadow: `0 0 8px ${t.fg}` }} />
                <div className="sub-child-body">
                  <div className="sub-child-label">{c.label}</div>
                  {c.meta && <div className="sub-child-meta">{c.meta}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sub-empty">
          <Icon name="sparkles" size={20} />
          <p>This subsection's dashboard isn't built out yet. Ask LifeOS what to surface here.</p>
        </div>
      )}
    </div>
  );
};

// ----- N8N FLOW VIEW (Agent Team workflow visualization) --------------------
const NODE_W = 180;
const NODE_H = 76;
const COL_GAP = 80;
const ROW_GAP = 28;

const buildLayout = (flow) => {
  // Topological column assignment: source nodes column 0, then BFS-increment.
  const nodes = flow.nodes;
  const edges = flow.edges;
  const incoming = {};
  nodes.forEach(n => { incoming[n.id] = 0; });
  edges.forEach(([_, to]) => { incoming[to] = (incoming[to] || 0) + 1; });

  const col = {};
  const queue = nodes.filter(n => incoming[n.id] === 0).map(n => n.id);
  queue.forEach(id => col[id] = 0);
  const inDeg = { ...incoming };
  while (queue.length) {
    const cur = queue.shift();
    edges.filter(([f]) => f === cur).forEach(([_, to]) => {
      col[to] = Math.max(col[to] || 0, (col[cur] || 0) + 1);
      inDeg[to] -= 1;
      if (inDeg[to] === 0) queue.push(to);
    });
  }
  // Group nodes by column for row assignment
  const byCol = {};
  nodes.forEach(n => { (byCol[col[n.id]] = byCol[col[n.id]] || []).push(n); });
  const placed = {};
  Object.keys(byCol).forEach(c => {
    byCol[c].forEach((n, i) => {
      placed[n.id] = {
        ...n,
        col: +c,
        row: i,
        x: +c * (NODE_W + COL_GAP),
        y: i * (NODE_H + ROW_GAP),
      };
    });
  });
  const cols = Math.max(...Object.keys(byCol).map(Number)) + 1;
  const rows = Math.max(...Object.values(byCol).map(a => a.length));
  return { placed, cols, rows, width: cols * NODE_W + (cols - 1) * COL_GAP, height: rows * NODE_H + (rows - 1) * ROW_GAP };
};

const N8nFlowView = ({ sub, onBack }) => {
  const { workspaceId, sectionTitle, item } = sub;
  const flow = (window.LIFEOS_FLOWS || {})[item.flowId];
  const ws = window.resolveWorkspace ? window.resolveWorkspace(workspaceId) : null;

  if (!flow) {
    return <SubsectionView sub={sub} onBack={onBack} />;
  }

  const layout = buildLayout(flow);
  const PADDING = 30;
  const viewW = layout.width + PADDING * 2;
  const viewH = layout.height + PADDING * 2;

  const nodeCenter = (id) => {
    const n = layout.placed[id];
    return { x: PADDING + n.x + NODE_W / 2, y: PADDING + n.y + NODE_H / 2 };
  };
  const nodeRightCenter = (id) => {
    const n = layout.placed[id];
    return { x: PADDING + n.x + NODE_W, y: PADDING + n.y + NODE_H / 2 };
  };
  const nodeLeftCenter = (id) => {
    const n = layout.placed[id];
    return { x: PADDING + n.x, y: PADDING + n.y + NODE_H / 2 };
  };

  // Bezier path between right-edge of source → left-edge of target
  const edgePath = (from, to) => {
    const a = nodeRightCenter(from);
    const b = nodeLeftCenter(to);
    const dx = Math.max(40, (b.x - a.x) * 0.5);
    return `M ${a.x},${a.y} C ${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  };

  return (
    <div className="canvas sub-canvas flow-canvas">
      <header className="sub-head">
        <button className="sub-back" onClick={onBack} title="Back to dashboard" aria-label="Back to dashboard">
          <Icon name="arrow-left" size={14} /> Dashboard
        </button>
        <div className="sub-breadcrumb">
          <span>{ws?.title}</span>
          <Icon name="chevron-right" size={12} />
          <span>{sectionTitle}</span>
          <Icon name="chevron-right" size={12} />
          <strong>{item.label}</strong>
        </div>
      </header>

      <section className="sub-hero flow-hero">
        <div className="sub-hero-ico"><Icon name={item.icon || "users-2"} size={28} /></div>
        <div>
          <h1>{flow.title || item.label}</h1>
          {item.meta && <p className="sub-hero-meta">{item.meta}</p>}
        </div>
        <div className="flow-stats">
          <div className="flow-stat"><span className="num">{flow.nodes.filter(n => n.type === "agent").length}</span><span className="lbl">agents</span></div>
          <div className="flow-stat"><span className="num">{flow.edges.length}</span><span className="lbl">edges</span></div>
          <div className="flow-stat"><span className="num">{flow.nodes.filter(n => n.status === "warn").length}</span><span className="lbl">attn</span></div>
        </div>
      </section>

      <div className="flow-canvas-wrap" role="img" aria-label={`${flow.title} workflow visualization`}>
        <svg className="flow-svg"
             viewBox={`0 0 ${viewW} ${viewH}`}
             width="100%"
             style={{ minWidth: viewW, height: viewH }}
             xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="arrow-cyan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--lifeos-cyan)" />
            </marker>
            <linearGradient id="edge-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--lifeos-cyan)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--lifeos-cyan)" stopOpacity="1" />
            </linearGradient>
          </defs>
          {/* Edges */}
          {flow.edges.map(([from, to], i) => (
            <path key={i} d={edgePath(from, to)} fill="none"
                  stroke="url(#edge-grad)" strokeWidth="2"
                  markerEnd="url(#arrow-cyan)"
                  strokeDasharray="6 4"
                  className="flow-edge">
              <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.6s" repeatCount="indefinite" />
            </path>
          ))}
          {/* Nodes */}
          {Object.values(layout.placed).map(n => {
            const nx = PADDING + n.x;
            const ny = PADDING + n.y;
            const statusColor = n.status === "warn" ? "var(--status-warn)" : "var(--lifeos-green)";
            const isTrigger = n.type === "trigger";
            const isOutput = n.type === "output";
            return (
              <g key={n.id} transform={`translate(${nx},${ny})`} className={`flow-node flow-node--${n.type}`}>
                <rect x="0" y="0" width={NODE_W} height={NODE_H} rx="12" className="flow-node-bg" />
                <rect x="0" y="0" width={NODE_W} height={NODE_H} rx="12" className="flow-node-border" />
                {!isTrigger && !isOutput && (
                  <circle cx={NODE_W - 14} cy="14" r="4" fill={statusColor}>
                    {n.status === "online" && <animate attributeName="opacity" values="1;.5;1" dur="1.6s" repeatCount="indefinite" />}
                  </circle>
                )}
                <foreignObject x="0" y="0" width={NODE_W} height={NODE_H}>
                  <div xmlns="http://www.w3.org/1999/xhtml" className={`flow-node-inner ${isTrigger ? "trigger" : isOutput ? "output" : "agent"}`}>
                    <span className="flow-node-ico"><Icon name={n.icon || "circle"} size={14} /></span>
                    <div className="flow-node-text">
                      <div className="flow-node-label">{n.label}</div>
                      {n.note && <div className="flow-node-note">{n.note}</div>}
                    </div>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flow-legend">
        <span><span className="flow-legend-dot" style={{ background: "var(--lifeos-cyan)" }} /> trigger</span>
        <span><span className="flow-legend-dot" style={{ background: "var(--lifeos-purple)" }} /> agent</span>
        <span><span className="flow-legend-dot" style={{ background: "var(--lifeos-green)" }} /> output</span>
        <span className="flow-legend-sep">·</span>
        <span><Icon name="circle" size={10} style={{ color: "var(--lifeos-green)" }} /> online</span>
        <span><Icon name="circle" size={10} style={{ color: "var(--status-warn)" }} /> needs attention</span>
      </div>
    </div>
  );
};

Object.assign(window, { App, SubsectionView, N8nFlowView });

// Mount
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
