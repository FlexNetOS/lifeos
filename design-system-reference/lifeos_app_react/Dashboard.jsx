// Dashboard — main canvas. Renders for every workspace.
// Includes clickable + draggable agent team cards.

const StatCard = ({ s }) => {
  const t = (window.TONE && window.TONE[s.tone]) || (window.TONE && window.TONE.cyan) || { bg: "transparent", fg: "#fff", bd: "#333" };
  return (
    <div className="stat-card" style={{
      background: `linear-gradient(180deg, ${t.bg} 0%, transparent 60%), var(--bg-2)`,
      borderColor: t.bd,
    }}>
      <div className="stat-head">
        <span className="stat-ico" style={{ background: t.bg, color: t.fg }}>
          <Icon name={s.icon} size={16} />
        </span>
        <span className="stat-delta" style={{ color: t.fg }}>{s.delta}</span>
      </div>
      <div className="stat-value">
        {s.value}<span className="stat-unit">{s.unit}</span>
      </div>
      <div className="stat-label">{s.label}</div>
      <div className="stat-meta">{s.meta}</div>
    </div>
  );
};

const ActivityItem = ({ a }) => {
  const t = (window.TONE && window.TONE[a.tone]) || (window.TONE && window.TONE.info) || { bg: "transparent", fg: "#fff" };
  return (
    <li className="activity-row">
      <span className="activity-ico" style={{ background: t.bg, color: t.fg }}>
        <Icon name={a.icon} size={14} />
      </span>
      <span className="activity-body">
        <span className="activity-title">{a.title}</span>
        <span className="activity-meta">{a.meta}</span>
      </span>
      <span className="activity-time">{a.time}</span>
    </li>
  );
};

const AgendaItem = ({ a }) => {
  const t = (window.TONE && window.TONE[a.tone]) || (window.TONE && window.TONE.cyan) || { bg: "transparent", fg: "#fff", bd: "#333" };
  return (
    <li className="agenda-row">
      <span className="agenda-time">{a.time}</span>
      <span className="agenda-bar" style={{ background: t.fg }} />
      <span className="agenda-body">
        <span className="agenda-title">{a.title}</span>
        <span className="agenda-tag" style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>{a.tag}</span>
      </span>
    </li>
  );
};

// Map dashboard team id → AI workspace expansion key
const TEAM_NAME_BY_ID = {
  "day":      "Day Captain",
  "inbox":    "Inbox Crew",
  "research": "Research Squad",
  "home-ops": "Home Ops",
  "wellness": "Wellness Crew",
  "finance":  "Finance Bench",
};

const AgentTeamCard = ({ t, idx, dragState, onClick, onDragStart, onDragOver, onDragEnter, onDragLeave, onDrop, onDragEnd }) => {
  const tone = (window.TONE && window.TONE[t.tone]) || (window.TONE && window.TONE.cyan) || { bg: "transparent", fg: "#fff", bd: "#333" };
  const statusColor = t.status === "warn" ? "var(--status-warn)" : "var(--lifeos-green)";
  const isDragging = dragState?.draggingId === t.id;
  const isDropTarget = dragState?.overId === t.id && dragState?.draggingId !== t.id;
  return (
    <button
      type="button"
      className={`team-card ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "is-drop-target" : ""}`}
      style={{ borderColor: tone.bd, animationDelay: `${idx * 60}ms` }}
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      aria-label={`Open ${t.name} in AI Command Center`}
    >
      <div className="team-head">
        <span className="team-ico" style={{ background: tone.bg, color: tone.fg }}>
          <Icon name={t.icon} size={14} />
        </span>
        <span className="team-name">{t.name}</span>
        <span className="team-status">
          <span className="team-dot" style={{ background: statusColor, boxShadow: t.status === "online" ? `0 0 8px ${statusColor}` : "none" }} />
        </span>
        <span className="team-grip" aria-hidden="true">
          <Icon name="grip-vertical" size={12} />
        </span>
      </div>
      <div className="team-meta">{t.meta}</div>
      <div className="team-foot">
        <span className="team-counter" style={{ color: tone.fg }}>{t.counter}</span>
        <span className="team-cta">Open <Icon name="arrow-right" size={11} /></span>
      </div>
    </button>
  );
};

const Dashboard = ({ onSelectWorkspace, onJumpToTeam }) => {
  const d = window.LIFEOS_DATA?.dashboardCanvas;
  const [teams, setTeams] = useState(() => d?.teams || []);
  const [dragState, setDragState] = useState({ draggingId: null, overId: null });

  if (!d) {
    return <div className="canvas"><h1 className="canvas-greeting">Loading…</h1></div>;
  }

  // Resolve the AI workspace's "Agent Teams" section position once
  const aiWs = window.LIFEOS_DATA.workspaces.ai;
  const agentTeamsItems = aiWs?.sections?.find(s => s.title === "Agent Teams")?.items || [];

  const handleClick = (t) => {
    const idx = agentTeamsItems.findIndex(x => x.flowId === t.flowId);
    const enriched = idx >= 0
      ? { ...agentTeamsItems[idx], _teamIndex: idx }
      : { label: t.name, icon: t.icon, view: "n8n-flow", flowId: t.flowId, _teamIndex: 0 };
    onJumpToTeam?.(enriched);
  };

  const handleDragStart = (e, id) => {
    setDragState({ draggingId: id, overId: null });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDragEnter = (id) => setDragState(s => ({ ...s, overId: id }));
  const handleDragLeave = (id) => setDragState(s => s.overId === id ? { ...s, overId: null } : s);
  const handleDrop = (e, targetId) => {
    e.preventDefault();
    const sourceId = dragState.draggingId;
    if (!sourceId || sourceId === targetId) { setDragState({ draggingId: null, overId: null }); return; }
    setTeams(prev => {
      const next = [...prev];
      const fromIdx = next.findIndex(x => x.id === sourceId);
      const toIdx = next.findIndex(x => x.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDragState({ draggingId: null, overId: null });
  };
  const handleDragEnd = () => setDragState({ draggingId: null, overId: null });

  return (
    <div className="canvas">
      <header className="canvas-head">
        <div>
          <div className="canvas-eyebrow">Tuesday · 19 May</div>
          <h1 className="canvas-greeting">{d.greeting}</h1>
          <p className="canvas-sub">{d.sub}</p>
        </div>
        <div className="canvas-actions">
          <button className="btn-gradient"><Icon name="sparkles" size={14} />Ask LifeOS</button>
          <button className="btn-secondary"><Icon name="plus" size={14} />New automation</button>
        </div>
      </header>

      <div className="stats-grid">
        {d.stats.map((s, i) => (
          <div key={s.id} className="fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
            <StatCard s={s} />
          </div>
        ))}
      </div>

      <div className="teams-block">
        <div className="teams-head">
          <h3>Your agent teams</h3>
          <span className="teams-meta">{teams.length} teams · 21 agents · running now</span>
          <span className="teams-hint"><Icon name="move" size={11} /> drag to reorder · click to open</span>
        </div>
        <div className="teams-grid">
          {teams.map((t, i) => (
            <AgentTeamCard key={t.id} t={t} idx={i}
              dragState={dragState}
              onClick={() => handleClick(t)}
              onDragStart={(e) => handleDragStart(e, t.id)}
              onDragOver={handleDragOver}
              onDragEnter={() => handleDragEnter(t.id)}
              onDragLeave={() => handleDragLeave(t.id)}
              onDrop={(e) => handleDrop(e, t.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      </div>

      <div className="canvas-cols">
        <div className="col-card">
          <div className="col-head">
            <h3>Activity feed</h3>
            <button className="link-btn">View all</button>
          </div>
          <ul className="activity-list">
            {d.activity.map((a, i) => <ActivityItem a={a} key={i} />)}
          </ul>
        </div>

        <div className="col-card">
          <div className="col-head">
            <h3>Today's agenda</h3>
            <button className="link-btn">Sync</button>
          </div>
          <ul className="agenda-list">
            {d.agenda.map((a, i) => <AgendaItem a={a} key={i} />)}
          </ul>
          <div className="ai-suggest">
            <span className="ai-ico"><Icon name="sparkles" size={14} /></span>
            <div>
              <strong>LifeOS suggests:</strong> move standup to 2:30 to clear a 60-min focus block.
            </div>
            <button className="link-btn cyan">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Dashboard, AgentTeamCard, StatCard, ActivityItem, AgendaItem });
