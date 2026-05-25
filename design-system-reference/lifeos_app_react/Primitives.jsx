// Badge + StatusDot + tiny primitives
const { useState, useEffect, useRef } = React;

// Convert kebab-case → PascalCase (play-circle → PlayCircle)
const toPascalCase = (s) => s.split("-").map(p => p[0].toUpperCase() + p.slice(1)).join("");

// Render lucide icons as real React-owned SVGs (no DOM mutation behind React's back)
const Icon = ({ name, size = 16, className = "", style, strokeWidth = 1.75 }) => {
  const key = toPascalCase(name);
  const iconData = window.lucide?.icons?.[key];
  if (!iconData) {
    return <span style={{ display: "inline-block", width: size, height: size, ...style }} className={className} />;
  }
  // lucide v0.475 icon data: [[tag, attrs], [tag, attrs], ...]
  return (
    <svg xmlns="http://www.w3.org/2000/svg"
         width={size} height={size}
         viewBox="0 0 24 24"
         fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
         className={className} style={style}>
      {iconData.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
};

const TONE = {
  cyan:   { bg: "rgba(0,212,255,.14)",  fg: "var(--lifeos-cyan)",   bd: "rgba(0,212,255,.3)" },
  purple: { bg: "rgba(155,123,255,.14)",fg: "var(--lifeos-purple)", bd: "rgba(155,123,255,.3)" },
  green:  { bg: "rgba(0,230,118,.14)",  fg: "var(--lifeos-green)",  bd: "rgba(0,230,118,.3)" },
  warn:   { bg: "rgba(255,176,32,.14)", fg: "var(--status-warn)",   bd: "rgba(255,176,32,.3)" },
  err:    { bg: "rgba(255,77,106,.14)", fg: "var(--status-err)",    bd: "rgba(255,77,106,.3)" },
  ok:     { bg: "rgba(0,230,118,.14)",  fg: "var(--lifeos-green)",  bd: "rgba(0,230,118,.3)" },
  info:   { bg: "rgba(0,212,255,.14)",  fg: "var(--lifeos-cyan)",   bd: "rgba(0,212,255,.3)" },
  neutral:{ bg: "var(--bg-3)",           fg: "var(--fg-1)",          bd: "var(--bg-4)" },
};

const Badge = ({ count, tone = "err", pulse, dot, children }) => {
  if (!count && !children && !dot) return null;
  const t = TONE[tone] || TONE.err;
  if (dot) return <span className={`status-dot ${pulse ? "pulse" : ""}`} style={{ background: t.fg, boxShadow: pulse ? `0 0 8px ${t.fg}` : "none" }} />;
  if (children) {
    return <span className="pill" style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>{children}</span>;
  }
  // count badge
  const styleBg = tone === "err" ? "var(--status-err)" : t.fg;
  const styleColor = tone === "err" ? "#fff" : "#0a0a0a";
  return (
    <span className={`count ${pulse ? "pulse-ring" : ""}`} style={{ background: styleBg, color: styleColor }}>
      {count > 99 ? "99+" : count}
    </span>
  );
};

const StatusDot = ({ status = "good" }) => {
  const map = {
    online: "var(--lifeos-green)", good: "var(--lifeos-green)", ok: "var(--lifeos-green)",
    busy: "var(--status-err)", warn: "var(--status-warn)", warning: "var(--status-warn)",
    away: "var(--status-warn)", error: "var(--status-err)",
    offline: "var(--fg-5)",
  };
  const color = map[status] || "var(--fg-5)";
  const pulse = status === "online";
  return (
    <span className={`status-dot ${pulse ? "pulse" : ""}`} style={{ background: color, boxShadow: pulse ? `0 0 8px ${color}` : "none" }} />
  );
};

const Kbd = ({ children }) => <kbd className="kbd">{children}</kbd>;

Object.assign(window, { Icon, Badge, StatusDot, Kbd, TONE });
