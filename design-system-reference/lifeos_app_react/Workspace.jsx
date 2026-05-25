// Workspace — secondary panel. Resolves data from:
//  - workspaces[id]            (AI, Gaming, Work, Personal, Home, Media)
//  - profile                    (id === "settings")
//  - aggregators                (id ∈ knowledge, todo, calendar, contacts, notify, favorites)
//
// Header title doubles as a dropdown for switching sections.

// ----- DATA RESOLVER --------------------------------------------------------
const resolveWorkspace = (workspaceId) => {
  if (!workspaceId) return null;
  const D = window.LIFEOS_DATA;
  if (workspaceId === "settings") return D.profile || null;
  if (D.workspaces[workspaceId]) return D.workspaces[workspaceId];

  // Footer aggregator entries — synthesize sections from aggregator output.
  const A = window.LIFEOS_AGGREGATORS;
  const footerEntry = (D.railFooter || []).find(r => r.id === workspaceId);
  if (!footerEntry || !A) return null;

  const groupByOrigin = (items) => {
    const groups = {};
    items.forEach(it => {
      const k = it._origin?.workspaceTitle || "Other";
      (groups[k] = groups[k] || []).push(it);
    });
    return Object.keys(groups).map(title => ({ title, items: groups[title] }));
  };

  const fn = A[workspaceId];
  if (typeof fn === "function") {
    const items = fn.call(A);
    return {
      title: footerEntry.tooltip?.split(" (")[0] || workspaceId,
      synced: true,
      sections: groupByOrigin(items),
    };
  }
  return { title: footerEntry.tooltip || workspaceId, sections: [{ title: "No data", items: [] }] };
};

// ----- MINI WORKSPACE -------------------------------------------------------
const MiniWorkspace = ({ workspaceId, onExpand }) => {
  const ws = resolveWorkspace(workspaceId);
  const railEntry =
    (window.LIFEOS_DATA.rail || []).find(r => r.id === workspaceId) ||
    (window.LIFEOS_DATA.railFooter || []).find(r => r.id === workspaceId);
  const wsName = ws?.title || workspaceId;
  const firstSection = ws?.sections?.[0];
  const quickItems = (firstSection?.items || []).slice(0, 6);

  return (
    <section className="workspace mini" aria-label={`${wsName} quick access`}>
      <button className="mini-id" onClick={onExpand} title={`Open ${wsName}`} aria-label={`Open ${wsName}`}>
        <Icon name={railEntry?.icon || "layers"} size={16} />
      </button>
      <div className="mini-actions">
        <button className="mini-btn" title="Search · ⌘K" aria-label="Search" onClick={onExpand}><Icon name="search" size={14} /></button>
        <button className="mini-btn primary" title={`New in ${wsName}`} aria-label={`New in ${wsName}`}><Icon name="plus" size={14} /></button>
        <button className="mini-btn" title="Ask LifeOS" aria-label="Ask LifeOS"><Icon name="sparkles" size={14} /></button>
      </div>
      {firstSection && (
        <>
          <div className="mini-sep" aria-hidden="true" />
          <div className="mini-section-label" title={firstSection.title}>
            {firstSection.title.split(" ").map(w => w[0]).join("").slice(0, 2)}
          </div>
          <nav className="mini-list">
            {quickItems.map((item, i) => (
              <button key={i} className={`mini-row ${item.active ? "active" : ""}`} onClick={onExpand}
                      title={`${item.label}${item.meta ? " · " + item.meta : ""}`} aria-label={item.label}>
                <span className="mini-row-ico">
                  <Icon name={item.icon || "circle"} size={14} />
                  {item.status && <span className="mini-row-status" style={{ background: item.status === "warn" ? "var(--status-warn)" : "var(--lifeos-green)" }} />}
                </span>
                {item.badge && (
                  <span className={`mini-row-badge tone-${item.badge.tone || "err"}`}>{item.badge.count > 99 ? "99+" : item.badge.count}</span>
                )}
              </button>
            ))}
          </nav>
        </>
      )}
      <button className="mini-expand" onClick={onExpand} title="Open workspace panel" aria-label="Open workspace panel">
        <Icon name="chevrons-right" size={14} />
      </button>
    </section>
  );
};

// ----- SECTION SELECTOR -----------------------------------------------------
const SectionSelector = ({ workspaceId, currentSection, onSelectSection }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const ws = resolveWorkspace(workspaceId);

  useEffect(() => {
    if (!open) return;
    const m = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", m);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", m); document.removeEventListener("keydown", k); };
  }, [open]);

  const sections = ws?.sections || [];
  const wsTitle = ws?.title || workspaceId;
  const pick = (title) => { onSelectSection(title); setOpen(false); };

  return (
    <div className="ws-selector" ref={ref}>
      <button className={`ws-selector-trigger ${open ? "open" : ""}`}
              onClick={() => setOpen(o => !o)}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`${wsTitle} — switch section`}>
        <span className="ws-selector-ws">{wsTitle}</span>
        <span className="ws-selector-sep">·</span>
        <h2>{currentSection || sections[0]?.title || "—"}</h2>
        <Icon name="chevron-down" size={14} className="ws-selector-chev" style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }} />
      </button>
      {open && (
        <div className="ws-selector-menu" role="listbox" aria-label={`${wsTitle} sections`}>
          <div className="ws-selector-eyebrow">{wsTitle} — sections</div>
          {sections.map((s) => {
            const isActive = s.title === currentSection;
            return (
              <button key={s.title}
                      className={`ws-selector-option ${isActive ? "active" : ""}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => pick(s.title)}>
                <span className="opt-ico"><Icon name={s.items?.[0]?.icon || "circle"} size={14} /></span>
                <span className="opt-label">{s.title}</span>
                <span className="opt-count">{s.items?.length || 0}</span>
                {isActive && <Icon name="check" size={12} className="opt-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ----- WORKSPACE ROOT -------------------------------------------------------
const Workspace = ({ workspaceId, currentSection, onSelectSection, activeSub, onSelectSub, onSelect, collapsed, onToggleCollapsed, pendingExpand, onConsumeExpand }) => {
  const ws = resolveWorkspace(workspaceId);

  useEffect(() => {
    if (!pendingExpand) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-expand-key="${CSS.escape(pendingExpand)}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("flash-highlight");
        setTimeout(() => el.classList.remove("flash-highlight"), 1400);
      }
      onConsumeExpand?.();
    });
  }, [pendingExpand, onConsumeExpand]);

  if (collapsed) return <MiniWorkspace workspaceId={workspaceId} onExpand={onToggleCollapsed} />;

  if (!ws) {
    return (
      <section className="workspace">
        <header className="ws-head">
          <div className="ws-selector"><h2 style={{textTransform:"capitalize", margin:0}}>{workspaceId.replace(/-/g," ")}</h2></div>
          <button className="ws-collapse" onClick={onToggleCollapsed} aria-label="Close workspace panel"><Icon name="chevron-left" size={14} /></button>
        </header>
        <div className="ws-body">
          <div className="ws-empty"><span className="ws-empty-ico"><Icon name="layers" size={18} /></span><div>This workspace isn't built out yet.</div></div>
        </div>
      </section>
    );
  }

  const section = ws.sections.find(s => s.title === currentSection) || ws.sections[0];

  return (
    <section className="workspace" data-workspace={workspaceId}>
      <header className="ws-head">
        <SectionSelector workspaceId={workspaceId}
                         currentSection={section?.title}
                         onSelectSection={onSelectSection} />
        <button className="ws-collapse" onClick={onToggleCollapsed} title="Close workspace panel" aria-label="Close workspace panel">
          <Icon name="chevron-left" size={14} />
        </button>
      </header>

      <div className="ws-body">
        {ws.synced && (
          <div className="ws-synced-banner">
            <Icon name="link" size={11} />
            <span>Synced view — aggregated from your workspaces</span>
          </div>
        )}
        <div className="ws-search">
          <Icon name="search" size={14} />
          <input placeholder={`Search ${section?.title?.toLowerCase() || ""}…`} aria-label="Search this section" />
          <Kbd>⌘K</Kbd>
        </div>

        {section && (
          <div className="ws-section">
            {section.items.map((item, i) => {
              const key = `${section.title}-${i}`;
              const isActiveSub = activeSub?.sectionTitle === section.title && activeSub?.item?.label === item.label;
              const enrichedItem = { ...item, active: isActiveSub, expandable: false };
              return (
                <div key={key} data-expand-key={key}>
                  <MenuRow item={enrichedItem} onClick={() => onSelectSub?.(item, section.title)} />
                  {item._origin && (
                    <div className="origin-tag" aria-hidden="true">
                      <Icon name="link" size={10} /> {item._origin.workspaceTitle}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

Object.assign(window, { Workspace, SectionSelector, MiniWorkspace, resolveWorkspace });
