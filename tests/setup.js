// LifeOS — Vitest global setup.
// Re-creates the runtime data globals the SFCs expect (window.LIFEOS_DATA, AGGREGATORS,
// FLOWS, TONE, resolveWorkspace) so components can mount without a full page bootstrap.

import { beforeAll } from "vitest";

// Minimal fixture mirroring the real data.js shape — covers every code path tests touch.
const FIXTURE = {
  rail: [
    { id: "ai",   icon: "sparkles",        tooltip: "AI",        badge: { count: 3, tone: "info" } },
    { id: "work", icon: "laptop",          tooltip: "Work" },
    { id: "home", icon: "home",            tooltip: "Home",      status: "good" },
  ],
  railFooter: [
    { id: "calendar", icon: "calendar", tooltip: "Calendar", badge: { count: 7, tone: "err" } },
    { id: "notify",   icon: "bell",     tooltip: "Notifications", badge: { count: 6, tone: "err" } },
    { id: "settings", icon: "settings", tooltip: "Settings", kind: "profile" },
  ],
  workspaces: {
    ai: {
      title: "AI Command Center",
      badge: { count: 3, tone: "info" },
      sections: [
        { title: "Rules",
          items: [
            { icon: "shield", label: "Quiet hours", meta: "After 7 PM", status: "good" },
          ] },
        { title: "Agent Teams",
          items: [
            { icon: "users-2", label: "Day Captain", flowId: "day", view: "n8n-flow", meta: "3 agents", status: "online" },
          ] },
      ],
    },
    work: { title: "Work", sections: [{ title: "Today", items: [{ icon: "video", label: "Standup" }] }] },
    home: { title: "Home", sections: [{ title: "IoT",   items: [{ icon: "wifi",  label: "Devices" }] }] },
  },
  profile: {
    title: "Settings & Profile",
    sections: [
      { title: "Profile", items: [{ icon: "user", label: "Account" }] },
    ],
  },
  dashboardCanvas: {
    greeting: "Good afternoon.",
    sub: "Things are quiet.",
    stats: [
      { id: "work", icon: "laptop", label: "Work", value: "87", unit: "%", delta: "+4", tone: "cyan", meta: "today" },
    ],
    teams: [
      { id: "day", icon: "calendar", name: "Day Captain", status: "online", meta: "3 agents", counter: "ok", tone: "cyan", flowId: "day" },
    ],
    activity: [
      { time: "2m", icon: "check-circle", tone: "ok", title: "Done", meta: "ok" },
    ],
    agenda: [
      { day: "Today",    time: "2:00 PM", title: "Standup",      tag: "Work",     tone: "cyan"   },
      { day: "Today",    time: "4:00 PM", title: "Soccer pickup", tag: "Family",   tone: "purple" },
      { day: "Tomorrow", time: "9:00 AM", title: "Client review", tag: "Work",     tone: "cyan"   },
    ],
  },
  // Phase 5 (Files subsection) — minimal fixture so FilesView mounts in tests.
  files: {
    work: {
      folders: [
        { id: "wf-src",   label: "src",     icon: "folder",      count: 18 },
        { id: "wf-tests", label: "tests",   icon: "folder",      count: 7  },
        { id: "wf-docs",  label: "docs",    icon: "folder-open", count: 3  },
      ],
      recent: [
        { id: "wr1", label: "App.vue",        path: "src/App.vue",        modified: "5m ago",  size: "1 KB",  kind: "vue",  folderId: "wf-src"   },
        { id: "wr2", label: "data.js",        path: "data.js",            modified: "1h ago",  size: "44 KB", kind: "js",   folderId: "wf-src"   },
        { id: "wr3", label: "setup.js",       path: "tests/setup.js",     modified: "2h ago",  size: "4 KB",  kind: "js",   folderId: "wf-tests" },
        { id: "wr4", label: "README.md",      path: "README.md",          modified: "3d ago",  size: "6 KB",  kind: "md",   folderId: "wf-docs"  },
        { id: "wr5", label: "package.json",   path: "package.json",       modified: "1d ago",  size: "924 B", kind: "json", folderId: "wf-src"   },
      ],
    },
    personal: {
      folders: [
        { id: "pf-docs",   label: "Documents", icon: "folder",      count: 24 },
        { id: "pf-photos", label: "Photos",    icon: "image",       count: 248 },
      ],
      recent: [
        { id: "pr1", label: "resume.pdf",     path: "Documents/resume.pdf",     modified: "1w ago",  size: "128 KB", kind: "pdf",  folderId: "pf-docs"   },
        { id: "pr2", label: "vacation.png",   path: "Photos/vacation.png",      modified: "2d ago",  size: "3.2 MB", kind: "png",  folderId: "pf-photos" },
        { id: "pr3", label: "notes.md",       path: "Documents/notes.md",       modified: "6h ago",  size: "12 KB",  kind: "md",   folderId: "pf-docs"   },
      ],
    },
  },
  // Health subsection — minimal fixture so HealthView mounts in tests.
  health: {
    metrics: [
      { id: "steps",  icon: "footprints",  label: "Steps",       value: "8,432", unit: "today",      delta: "+12% vs avg", tone: "cyan"   },
      { id: "sleep",  icon: "moon",        label: "Sleep",       value: "7.2h",  unit: "last night", delta: "92% quality", tone: "purple" },
      { id: "heart",  icon: "heart-pulse", label: "Resting HR",  value: "62",    unit: "bpm",        delta: "in range",    tone: "green"  },
      { id: "active", icon: "activity",    label: "Active mins", value: "47",    unit: "today",      delta: "goal: 60",    tone: "warn"   },
    ],
    sleep: [
      { day: "Mon", hours: 6.8, quality: 88 },
      { day: "Tue", hours: 7.4, quality: 91 },
      { day: "Wed", hours: 6.2, quality: 82 },
      { day: "Thu", hours: 7.9, quality: 94 },
      { day: "Fri", hours: 6.5, quality: 86 },
      { day: "Sat", hours: 8.1, quality: 96 },
      { day: "Sun", hours: 7.2, quality: 92 },
    ],
    activity: [
      { day: "Mon", move: 420, exercise: 30, stand: 10 },
      { day: "Tue", move: 510, exercise: 45, stand: 12 },
      { day: "Wed", move: 380, exercise: 20, stand:  9 },
      { day: "Thu", move: 560, exercise: 55, stand: 13 },
      { day: "Fri", move: 490, exercise: 40, stand: 11 },
      { day: "Sat", move: 640, exercise: 62, stand: 14 },
      { day: "Sun", move: 480, exercise: 47, stand: 11 },
    ],
    heart: [
      { time: "06:00", bpm: 58 },
      { time: "08:00", bpm: 72 },
      { time: "10:00", bpm: 68 },
      { time: "12:00", bpm: 74 },
      { time: "14:00", bpm: 70 },
      { time: "16:00", bpm: 85 },
      { time: "18:00", bpm: 76 },
      { time: "20:00", bpm: 62 },
    ],
  },
  // IoT subsection — minimal fixture so IoTView mounts in tests.
  iot: {
    rooms: [
      { id: "living",  label: "Living room", icon: "sofa",     online: 2, total: 2 },
      { id: "bed",     label: "Bedroom",     icon: "bed",      online: 1, total: 2 },
      { id: "kitchen", label: "Kitchen",     icon: "utensils", online: 1, total: 1 },
    ],
    devices: [
      { id: "d1", roomId: "living",  label: "Smart TV",    type: "tv",      online: true,  latencyMs: 12, signal: 96, battery: null, lastSeen: "just now" },
      { id: "d2", roomId: "living",  label: "Soundbar",    type: "audio",   online: true,  latencyMs: 8,  signal: 92, battery: null, lastSeen: "just now" },
      { id: "d3", roomId: "bed",     label: "Thermostat",  type: "climate", online: true,  latencyMs: 22, signal: 84, battery: 78,   lastSeen: "20 s ago" },
      { id: "d4", roomId: "bed",     label: "Air sensor",  type: "sensor",  online: false, latencyMs: 0,  signal: 0,  battery: 8,    lastSeen: "8 min ago" },
      { id: "d5", roomId: "kitchen", label: "Leak sensor", type: "sensor",  online: true,  latencyMs: 31, signal: 78, battery: 55,   lastSeen: "1 min ago" },
    ],
    signals: [
      { id: "wan",   label: "WAN",        bars: 5, kind: "primary",   meta: "1.2 Gbps" },
      { id: "wifi5", label: "Wi-Fi 5",    bars: 4, kind: "secondary", meta: "Living, Office" },
      { id: "wifi2", label: "Wi-Fi 2.4",  bars: 3, kind: "secondary", meta: "Garage, Outdoor" },
      { id: "mesh",  label: "Mesh nodes", bars: 5, kind: "primary",   meta: "4 nodes" },
    ],
  },
  // Contacts subsection — minimal fixture so ContactsView mounts in tests.
  contacts: {
    work: [
      { id: "wc01", name: "Priya Nair",      role: "Engineering Lead", organisation: "Acme Corp", email: "priya@acme.io",  phone: "+1 415 555 0101", avatarTone: "cyan",   lastSeen: "2m ago",    channel: "mail",           starred: true  },
      { id: "wc02", name: "Marcus Johansson", role: "Product Manager",  organisation: "Acme Corp", email: "marcus@acme.io", phone: "+1 415 555 0102", avatarTone: "purple", lastSeen: "1h ago",    channel: "message-square", starred: true  },
      { id: "wc03", name: "Leila Osei",       role: "Design Director",  organisation: "Acme Corp", email: "leila@acme.io",  phone: "+1 415 555 0103", avatarTone: "green",  lastSeen: "3d ago",    channel: "mail",           starred: false },
    ],
    personal: [
      { id: "pc01", name: "Jamie Rivera",     role: "Close friend",     organisation: "",          email: "jamie@gmail.com",phone: "+1 650 555 0301", avatarTone: "purple", lastSeen: "10m ago",   channel: "message-square", starred: true  },
      { id: "pc02", name: "Taylor Brooks",    role: "Neighbour",        organisation: "",          email: "tbrooks@gmail.com",phone:"+1 650 555 0302",avatarTone: "green",  lastSeen: "Yesterday", channel: "phone",          starred: false },
      { id: "pc03", name: "Dr. Amara Diallo", role: "GP",               organisation: "City Health",email:"adiallo@cityhealth.org",phone:"+1 650 555 0303",avatarTone:"cyan",lastSeen:"2w ago",channel:"phone",           starred: false },
    ],
  },
  // Phase 4 (Lights subsection) — minimal fixture so LightsView mounts in tests.
  lighting: {
    scenes: [
      { id: "focus",  label: "Focus",  icon: "zap",  active: true,  gradient: "linear-gradient(135deg, rgba(0,212,255,.3), transparent)" },
      { id: "cinema", label: "Cinema", icon: "film", active: false, gradient: "linear-gradient(135deg, rgba(155,123,255,.3), transparent)" },
      { id: "glow",   label: "Glow",   icon: "sun",  active: false, gradient: "linear-gradient(135deg, rgba(0,230,118,.3), transparent)" },
      { id: "sleep",  label: "Sleep",  icon: "moon", active: false, gradient: "var(--bg-2)" },
    ],
    rooms: [
      { id: "living",  label: "Living Room", icon: "sofa",     activeCount: 2, devices: [
        { id: "l1", label: "Strip",  type: "strip", isOn: true,  brightness: 80, colorTemp: 3000 },
        { id: "l2", label: "Lamp",   type: "lamp",  isOn: true,  brightness: 40, colorTemp: 5000 },
        { id: "l3", label: "Ceiling",type: "bulb",  isOn: false, brightness: 0 },
      ]},
      { id: "bed",     label: "Bedroom",     icon: "bed",      activeCount: 1, devices: [
        { id: "b1", label: "Reading", type: "lamp", isOn: true,  brightness: 20, colorTemp: 2700 },
        { id: "b2", label: "Stand",   type: "lamp", isOn: false, brightness: 0 },
      ]},
      { id: "kitchen", label: "Kitchen",     icon: "utensils", activeCount: 0, devices: [
        { id: "k1", label: "Island", type: "pendant", isOn: false, brightness: 0 },
      ]},
    ],
    schedules: [
      { id: "s1", label: "Morning wake",  time: "07:00 AM", days: "Mon–Fri", sceneId: "focus",  enabled: true },
      { id: "s2", label: "Wind-down",     time: "09:30 PM", days: "Daily",   sceneId: "cinema", enabled: true },
    ],
  },
  // Notifications inbox — minimal fixture for NotificationsDrawer tests.
  notifications: [
    { id: "t01", ts: "2m ago",    icon: "check-circle",   tone: "green",  title: "Day Captain completed morning plan", body: "12 tasks scheduled.",      source: "Day Captain",      unread: true,
      link: { workspaceId: "ai", sectionTitle: "Agent Teams", itemLabel: "Day Captain" } },
    { id: "t02", ts: "8m ago",    icon: "alert-triangle", tone: "warn",   title: "Grocery restock needed",            body: "Milk and eggs low.",        source: "Home Ops",         unread: true },
    { id: "t03", ts: "1h ago",    icon: "sparkles",       tone: "purple", title: "AI insight ready",                  body: "3 patterns identified.",    source: "AI Command Center",unread: true },
    { id: "t04", ts: "3h ago",    icon: "check",          tone: "green",  title: "Standup notes filed",               body: "Saved to Work / Today.",    source: "Work",             unread: false },
    { id: "t05", ts: "4h ago",    icon: "shield-check",   tone: "green",  title: "Security scan passed",              body: "No threats found.",         source: "AI Command Center",unread: false },
    { id: "t06", ts: "Yesterday", icon: "shield-alert",   tone: "err",    title: "VPN disconnected briefly",          body: "Kill switch fired for 4 s.", source: "Home Ops",         unread: false },
  ],
};

const AGGREGATORS = {
  _scan(predicate) {
    const out = [];
    Object.keys(FIXTURE.workspaces).forEach(wsId => {
      const ws = FIXTURE.workspaces[wsId];
      (ws.sections || []).forEach(sec => {
        (sec.items || []).forEach(item => {
          if (predicate(item, sec, ws)) {
            out.push({ ...item, _origin: { workspaceId: wsId, workspaceTitle: ws.title, section: sec.title } });
          }
        });
      });
    });
    return out;
  },
  calendar() { return this._scan((_, s) => s.title === "Calendar" || s.title === "Today"); },
  todos()    { return this._scan((item) => item.status === "warn"); },
  contacts() { return this._scan((_, s) => s.title === "Contacts"); },
};

const FLOWS = {
  day: {
    title: "Day Captain — workflow",
    nodes: [
      { id: "t", type: "trigger", label: "Day starts", icon: "sunrise" },
      { id: "s", type: "agent",   label: "Scheduler",  icon: "calendar", status: "online" },
      { id: "o", type: "output",  label: "Plan",       icon: "check-circle" },
    ],
    edges: [["t","s"],["s","o"]],
  },
};

const TONE = {
  cyan:    { bg: "rgba(0,212,255,.14)",   fg: "var(--lifeos-cyan)",   bd: "rgba(0,212,255,.3)" },
  purple:  { bg: "rgba(155,123,255,.14)", fg: "var(--lifeos-purple)", bd: "rgba(155,123,255,.3)" },
  green:   { bg: "rgba(0,230,118,.14)",   fg: "var(--lifeos-green)",  bd: "rgba(0,230,118,.3)" },
  warn:    { bg: "rgba(255,176,32,.14)",  fg: "var(--status-warn)",   bd: "rgba(255,176,32,.3)" },
  ok:      { bg: "rgba(0,230,118,.14)",   fg: "var(--lifeos-green)",  bd: "rgba(0,230,118,.3)" },
  err:     { bg: "rgba(255,77,106,.14)",  fg: "var(--status-err)",    bd: "rgba(255,77,106,.3)" },
  info:    { bg: "rgba(0,212,255,.14)",   fg: "var(--lifeos-cyan)",   bd: "rgba(0,212,255,.3)" },
  neutral: { bg: "var(--bg-3)",            fg: "var(--fg-1)",          bd: "var(--bg-4)" },
};

beforeAll(() => {
  globalThis.LIFEOS_DATA = FIXTURE;
  globalThis.LIFEOS_AGGREGATORS = AGGREGATORS;
  globalThis.LIFEOS_FLOWS = FLOWS;
  globalThis.TONE = TONE;
  // window in happy-dom mirrors globalThis but be explicit
  if (typeof window !== "undefined") {
    window.LIFEOS_DATA = FIXTURE;
    window.LIFEOS_AGGREGATORS = AGGREGATORS;
    window.LIFEOS_FLOWS = FLOWS;
    window.TONE = TONE;
  }
});
