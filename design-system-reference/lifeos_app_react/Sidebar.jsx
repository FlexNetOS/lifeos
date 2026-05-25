// Sidebar — narrow icon-only primary rail (matches FlexNetOS/Sidebar reference)

const RailButton = ({ item, active, onClick }) => (
  <button className={`rail-btn ${active ? "active" : ""}`}
          onClick={onClick}
          title={item.tooltip || item.label}>
    <Icon name={item.icon} size={16} />
    {item.status && <span className="rail-status"><StatusDot status={item.status} /></span>}
    {item.badge && (
      <span className={`rail-badge tone-${item.badge.tone || "err"} ${item.badge.pulse ? "pulse-ring" : ""}`}>
        {item.badge.count > 99 ? "99+" : item.badge.count}
      </span>
    )}
  </button>
);

const RailWorkspaceSwitcher = ({ activeId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const rail = window.LIFEOS_DATA?.rail || [];
  const railFooter = window.LIFEOS_DATA?.railFooter || [];
  const all = rail.concat(railFooter);

  const pick = (id) => { onSelect(id); setOpen(false); };

  return (
    <div className="rail-switcher" ref={ref}>
      <button className={`rail-switcher-trigger ${open ? "open" : ""}`}
              onClick={() => setOpen(o => !o)}
              title="Switch workspace"
              aria-label="Switch workspace">
        <Icon name="layers" size={14} />
      </button>
      {open && (
        <div className="rail-switcher-menu" role="listbox">
          <div className="rail-switcher-eyebrow">Workspace</div>
          {all.map(item => {
            const ws = window.LIFEOS_DATA.workspaces[item.id];
            const label = ws?.title || item.tooltip || item.id;
            const isActive = item.id === activeId;
            return (
              <button key={item.id}
                      className={`rail-switcher-option ${isActive ? "active" : ""}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => pick(item.id)}>
                <span className="opt-ico"><Icon name={item.icon} size={14} /></span>
                <span className="opt-label">{label}</span>
                {item.badge && (
                  <span className={`opt-badge tone-${item.badge.tone || "err"}`}>{item.badge.count > 99 ? "99+" : item.badge.count}</span>
                )}
                {isActive && <Icon name="check" size={12} className="opt-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Sidebar = ({ activeId, onSelect, wsCollapsed, onToggleWs, onOpenCmdK }) => (
  <aside className="rail">
    <button className={`rail-brand ${wsCollapsed ? "collapsed" : ""}`}
            onClick={onToggleWs}
            title={wsCollapsed ? "Open workspace panel" : "Close workspace panel"}
            aria-label="Toggle workspace panel">
      <img src="../../assets/lifeos-mark-256.png" alt="LifeOS" />
    </button>

    <RailWorkspaceSwitcher activeId={activeId} onSelect={onSelect} />

    <button className="rail-cmdk"
            onClick={onOpenCmdK}
            title="Open command palette (⌘K)"
            aria-label="Open command palette">
      <Icon name="search" size={13} />
      <Kbd>⌘K</Kbd>
    </button>

    <nav className="rail-list" aria-label="Workspaces">
      {window.LIFEOS_DATA.rail.map(item => (
        <RailButton key={item.id}
                    item={item}
                    active={activeId === item.id}
                    onClick={() => onSelect(item.id)} />
      ))}
    </nav>

    <div className="rail-footer" aria-label="Persistent global icons">
      {(window.LIFEOS_DATA.railFooter || []).map(item => (
        <RailButton key={item.id}
                    item={item}
                    active={activeId === item.id}
                    onClick={() => onSelect(item.id)} />
      ))}
    </div>
  </aside>
);

Object.assign(window, { Sidebar, RailButton, RailWorkspaceSwitcher });
