// MenuRow + SubRow — sidebar list items

const MenuRow = ({ item, expanded, onToggle, onClick, collapsed }) => {
  const handleClick = () => {
    if (item.expandable && onToggle) onToggle();
    else onClick && onClick(item);
  };
  return (
    <div className={`menu-row ${item.active ? "active" : ""} ${collapsed ? "collapsed" : ""}`}
         onClick={handleClick}
         title={collapsed ? item.label : undefined}>
      <span className="lead">
        <Icon name={item.icon} size={16} />
        {item.status && <span className="lead-status"><StatusDot status={item.status} /></span>}
        {collapsed && item.badge && <Badge {...item.badge} />}
      </span>
      {!collapsed && (
        <>
          <span className="body">
            <span className="label">{item.label}</span>
            {item.meta && <span className="meta">{item.meta}</span>}
          </span>
          {item.badge && <span className="trail"><Badge {...item.badge} /></span>}
          {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
          {item.expandable && (
            <Icon name="chevron-down" size={14}
                  className="chev"
                  style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform .25s" }} />
          )}
        </>
      )}
    </div>
  );
};

const SubRow = ({ item }) => (
  <div className="sub-row">
    {item.status && <StatusDot status={item.status} />}
    <span className="sub-body">
      <span className="sub-label">{item.label}</span>
      {item.meta && <span className="sub-meta">{item.meta}</span>}
    </span>
  </div>
);

Object.assign(window, { MenuRow, SubRow });
