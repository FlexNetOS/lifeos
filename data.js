// LifeOS — workspace data (sot.md-conforming)
// 6 workspaces + footer cluster + Settings/Profile (gear icon, side-panel pattern)
// + aggregators for cross-workspace Calendar / To-do / Contacts / etc.

window.LIFEOS_DATA = {
  // ---------- LEFT RAIL ----------
  rail: [
    { id: "ai",       icon: "sparkles",   tooltip: "AI Command Center", badge: { count: 3, tone: "info" } },
    { id: "gaming",   icon: "gamepad-2",  tooltip: "Gaming",            badge: { count: 1, tone: "ok" } },
    { id: "work",     icon: "laptop",     tooltip: "Work",              badge: { count: 5, tone: "err" } },
    { id: "personal", icon: "heart",      tooltip: "Personal",          badge: { count: 2, tone: "info" } },
    { id: "home",     icon: "home",       tooltip: "Home Automation",   status: "good" },
    { id: "media",    icon: "play-circle",tooltip: "Media",             badge: { count: 4, tone: "ok" } },
  ],

  // ---------- FOOTER (persistent globals — aggregate across workspaces) ----------
  // Order top → bottom: knowledge / todo / calendar / contacts / notify / favorites / settings
  railFooter: [
    { id: "knowledge", icon: "brain",     tooltip: "Knowledge (synced from all workspaces)" },
    { id: "todo",      icon: "list-todo", tooltip: "To-do (aggregated)", badge: { count: 12, tone: "err" } },
    { id: "calendar",  icon: "calendar",  tooltip: "Calendar (aggregated)", badge: { count: 7, tone: "err" } },
    { id: "contacts",  icon: "users",     tooltip: "Contacts (aggregated)", badge: { count: 7, tone: "info" } },
    { id: "notify",    icon: "bell",      tooltip: "Notifications",        badge: { count: 6, tone: "err" } },
    { id: "favorites", icon: "star",      tooltip: "Favorites · recents · pinned", badge: { count: 5, tone: "info" } },
    { id: "settings",  icon: "settings",  tooltip: "Settings & Profile", kind: "profile" },
  ],

  // ---------- WORKSPACES (per sot.md) ----------
  workspaces: {
    // 1 · AI COMMAND CENTER — Rules · Goals · Ideas + "Your AI" + "Agent Teams" (kept, with n8n flow visuals)
    ai: {
      title: "AI Command Center",
      badge: { count: 3, tone: "info" },
      sections: [
        { title: "Your AI", items: [
          { icon: "bot", label: "LifeOS", meta: "Always on · running your day", status: "online", shortcut: "⌘1" },
        ]},
        // UI-Editor — OpenPencil integration. The AI uses these to edit & ship its own UI.
        // Each item opens a dedicated view in the right canvas.
        // Source: github.com/FlexNetOS/open-pencil/tree/develop  (MIT, Vue 3 + Tauri + Skia)
        { title: "UI-Editor", items: [
          { icon: "pen-tool",      label: "OpenPencil canvas",  meta: "Edit LifeOS UI live · Skia/CanvasKit", status: "online", view: "open-pencil", pane: "canvas",     shortcut: "⌘P" },
          { icon: "layers",        label: "Components",          meta: "Local + remote design system",        view: "open-pencil", pane: "components" },
          { icon: "message-square",label: "AI Chat (⌘J)",       meta: "100+ design tools · BYO key",         view: "open-pencil", pane: "ai-chat", badge: { count: 2, tone: "info" } },
          { icon: "terminal",      label: "MCP server",          meta: "stdio + HTTP · 100+ tools",            view: "open-pencil", pane: "mcp", status: "good" },
          { icon: "users-2",       label: "Coding agent",        meta: "Claude · Codex · Gemini CLI",          view: "open-pencil", pane: "agent" },
          { icon: "palette",       label: "Tokens & variables",  meta: "Extract → export Tailwind / CSS",      view: "open-pencil", pane: "tokens" },
          { icon: "shield-check",  label: "Lint",                meta: "Naming · layout · a11y",               view: "open-pencil", pane: "lint" },
          { icon: "download",      label: "Export",              meta: "PNG · SVG · .fig · JSX · Tailwind",    view: "open-pencil", pane: "export" },
        ]},
        { title: "Rules", items: [
          { icon: "shield", label: "Work-life balance",  meta: "Quiet hours after 7 PM", status: "good" },
          { icon: "shield", label: "Family safety",       meta: "Geofences active",       status: "good" },
          { icon: "shield", label: "Security protocols",  meta: "All armed",              status: "good" },
          { icon: "shield", label: "Energy efficiency",   meta: "Auto eco-mode",          status: "good" },
          { icon: "plus",   label: "Add a rule" },
        ]},
        { title: "Goals", items: [
          { icon: "target", label: "Q1 product launch",    meta: "85% complete",      status: "good" },
          { icon: "target", label: "Family vacation Q2",   meta: "Booking needed",    status: "warn" },
          { icon: "target", label: "Half marathon",        meta: "Training · week 6", status: "good" },
          { icon: "target", label: "Home security upgrade",meta: "On track",          status: "good" },
          { icon: "plus",   label: "Add a goal" },
        ]},
        { title: "Ideas", items: [
          { icon: "lightbulb", label: "Weekend automation flows", meta: "AI suggested" },
          { icon: "lightbulb", label: "Cost-saving strategies",   meta: "High priority" },
          { icon: "lightbulb", label: "Family time optimization", meta: "New" },
          { icon: "plus",      label: "Capture an idea" },
        ]},
        // Files — every source file in the LifeOS Vue project.
        // Used by the AI (via UI-Editor / OpenPencil agent) to find, open, and edit code in-place.
        // Keep in sync with the `ui_kits/lifeos_vue/` tree when adding files.
        { title: "Files", items: [
          { icon: "file-text", label: "README.md", meta: "/", view: "open-pencil", pane: "files", path: "README.md" },
          { icon: "file-check", label: "AUDIT.md", meta: "/ · component audit + test plan", view: "open-pencil", pane: "files", path: "AUDIT.md" },
          { icon: "file-code-2", label: "index.html", meta: "/ · in-browser preview entry", view: "open-pencil", pane: "files", path: "index.html" },
          { icon: "file-code-2", label: "data.js", meta: "/ · workspaces · hubs · flows", view: "open-pencil", pane: "files", path: "data.js" },
          { icon: "file-code-2", label: "styles.css", meta: "/", view: "open-pencil", pane: "files", path: "styles.css" },
          { icon: "file-json-2", label: "package.json", meta: "/ · npm scripts + deps", view: "open-pencil", pane: "files", path: "package.json" },
          { icon: "file-json-2", label: "tsconfig.json", meta: "/", view: "open-pencil", pane: "files", path: "tsconfig.json" },
          { icon: "file-code-2", label: "vite.config.ts", meta: "/", view: "open-pencil", pane: "files", path: "vite.config.ts" },
          { icon: "file-code-2", label: "vitest.config.ts", meta: "/", view: "open-pencil", pane: "files", path: "vitest.config.ts" },
          { icon: "file-code", label: "src/App.vue", meta: "Root shell", view: "open-pencil", pane: "files", path: "src/App.vue" },
          { icon: "file-code", label: "src/main.ts", meta: "createApp · Pinia · router", view: "open-pencil", pane: "files", path: "src/main.ts" },
          { icon: "file-code", label: "src/components/Sidebar.vue", meta: "Primary rail", view: "open-pencil", pane: "files", path: "src/components/Sidebar.vue" },
          { icon: "file-code", label: "src/components/Workspace.vue", meta: "Secondary panel + drag/drop", view: "open-pencil", pane: "files", path: "src/components/Workspace.vue" },
          { icon: "file-code", label: "src/components/Dashboard.vue", meta: "Main canvas + team cards", view: "open-pencil", pane: "files", path: "src/components/Dashboard.vue" },
          { icon: "file-code", label: "src/components/SubsectionView.vue", meta: "Per-subsection detail", view: "open-pencil", pane: "files", path: "src/components/SubsectionView.vue" },
          { icon: "file-code", label: "src/components/N8nFlowView.vue", meta: "Agent workflow SVG", view: "open-pencil", pane: "files", path: "src/components/N8nFlowView.vue" },
          { icon: "file-code",   label: "src/components/OpenPencilEditor.vue",meta: "UI-Editor surface" },
          { icon: "file-code", label: "src/components/AIAvatar.vue", meta: "Floating bot", view: "open-pencil", pane: "files", path: "src/components/AIAvatar.vue" },
          { icon: "file-code", label: "src/components/AIChat.vue", meta: "Chat panel (shared store)", view: "open-pencil", pane: "files", path: "src/components/AIChat.vue" },
          { icon: "file-code", label: "src/components/MenuRow.vue", meta: "Section item row", view: "open-pencil", pane: "files", path: "src/components/MenuRow.vue" },
          { icon: "file-code", label: "src/components/Badge.vue", meta: "Count / dot / pill", view: "open-pencil", pane: "files", path: "src/components/Badge.vue" },
          { icon: "file-code", label: "src/components/Icon.vue", meta: "Lucide wrapper", view: "open-pencil", pane: "files", path: "src/components/Icon.vue" },
          { icon: "file-code", label: "src/stores/lifeos.ts", meta: "Pinia (TS)", view: "open-pencil", pane: "files", path: "src/stores/lifeos.ts" },
          { icon: "file-code", label: "src/stores/lifeos.js", meta: "Pinia (JS preview)", view: "open-pencil", pane: "files", path: "src/stores/lifeos.js" },
          { icon: "file-code", label: "src/router/index.ts", meta: "/workspace/:id/:section?/:sub?", view: "open-pencil", pane: "files", path: "src/router/index.ts" },
          { icon: "file-code", label: "src/lib/resolve.ts", meta: "resolveWorkspace + flow (TS)", view: "open-pencil", pane: "files", path: "src/lib/resolve.ts" },
          { icon: "file-code", label: "src/lib/resolve.js", meta: "resolveWorkspace + flow (JS)", view: "open-pencil", pane: "files", path: "src/lib/resolve.js" },
          { icon: "file-code-2", label: "src-tauri/Cargo.toml", meta: "Rust deps", view: "open-pencil", pane: "files", path: "src-tauri/Cargo.toml" },
          { icon: "file-code-2", label: "src-tauri/tauri.conf.json", meta: "Window · menu · fs scope", view: "open-pencil", pane: "files", path: "src-tauri/tauri.conf.json" },
          { icon: "file-code-2", label: "src-tauri/src/main.rs", meta: "Tauri entry", view: "open-pencil", pane: "files", path: "src-tauri/src/main.rs" },
          { icon: "file-code-2", label: "src-tauri/build.rs", meta: "tauri-build", view: "open-pencil", pane: "files", path: "src-tauri/build.rs" },
          { icon: "file-code-2", label: "src-tauri/.gitignore", meta: "target / gen / icons", view: "open-pencil", pane: "files", path: "src-tauri/.gitignore" },
          { icon: "flask-conical", label: "tests/setup.js", meta: "Global fixtures · LIFEOS_DATA shim", view: "open-pencil", pane: "files", path: "tests/setup.js" },
          { icon: "flask-conical", label: "tests/__mocks__/lucide-vue-next.js", meta: "Icon mock", view: "open-pencil", pane: "files", path: "tests/__mocks__/lucide-vue-next.js" },
          { icon: "flask-conical", label: "tests/Icon.spec.js", meta: "3 specs", view: "open-pencil", pane: "files", path: "tests/Icon.spec.js" },
          { icon: "flask-conical", label: "tests/Badge.spec.js", meta: "4 specs", view: "open-pencil", pane: "files", path: "tests/Badge.spec.js" },
          { icon: "flask-conical", label: "tests/MenuRow.spec.js", meta: "6 specs", view: "open-pencil", pane: "files", path: "tests/MenuRow.spec.js" },
          { icon: "flask-conical", label: "tests/Sidebar.spec.js", meta: "5 specs", view: "open-pencil", pane: "files", path: "tests/Sidebar.spec.js" },
          { icon: "flask-conical", label: "tests/Workspace.spec.js", meta: "7 specs", view: "open-pencil", pane: "files", path: "tests/Workspace.spec.js" },
          { icon: "flask-conical", label: "tests/Dashboard.spec.js", meta: "3 specs", view: "open-pencil", pane: "files", path: "tests/Dashboard.spec.js" },
          { icon: "flask-conical", label: "tests/SubsectionAndFlow.spec.js", meta: "5 specs", view: "open-pencil", pane: "files", path: "tests/SubsectionAndFlow.spec.js" },
          { icon: "flask-conical", label: "tests/store.spec.js", meta: "6 specs", view: "open-pencil", pane: "files", path: "tests/store.spec.js" },
          { icon: "flask-conical", label: "tests/resolve.spec.js", meta: "6 specs", view: "open-pencil", pane: "files", path: "tests/resolve.spec.js" },
        ]},
        { title: "Agent Teams", items: [
          { icon: "users-2", label: "Day Captain",     meta: "3 agents · scheduling",     status: "online", badge: { count: 2, tone: "ok"   }, view: "n8n-flow", flowId: "day"       },
          { icon: "users-2", label: "Inbox Crew",      meta: "4 agents · triaging",       status: "online", badge: { count: 12,tone: "err"  }, view: "n8n-flow", flowId: "inbox"     },
          { icon: "users-2", label: "Research Squad",  meta: "3 agents · 4 briefs",       status: "online",                                  view: "n8n-flow", flowId: "research"  },
          { icon: "users-2", label: "Home Ops",        meta: "5 agents · 1 alert",        status: "warn",   badge: { count: 1, tone: "warn" }, view: "n8n-flow", flowId: "home-ops"  },
          { icon: "users-2", label: "Wellness Crew",   meta: "3 agents · you + family",   status: "online",                                  view: "n8n-flow", flowId: "wellness"  },
          { icon: "users-2", label: "Finance Bench",   meta: "3 agents · money + bills",  status: "online", badge: { count: 2, tone: "warn" }, view: "n8n-flow", flowId: "finance"   },
          { icon: "plus",    label: "Assemble a team" },
        ]},
      ],
    },

    // 2 · GAMING — L1 / L2 (sot.md)
    gaming: {
      title: "Gaming",
      badge: { count: 1, tone: "ok" },
      sections: [
        { title: "Your progress", items: [
          { icon: "trophy",      label: "Current level",  meta: "L1 · Who-Am-I",  status: "good", badge: { count: 62, tone: "ok" } },
          { icon: "trending-up", label: "XP this week",   meta: "+1,240 · streak 5d" },
          { icon: "zap",         label: "AI autonomy",    meta: "32% delegated · grows with level" },
        ]},
        { title: "L1 · Who Am I", items: [
          { icon: "user-search", label: "Self-discovery", meta: "62% to next level",   status: "good" },
          { icon: "circle",      label: "Daily reflection",   meta: "3 / 5 done",      status: "good" },
          { icon: "circle",      label: "Map your routines",  meta: "12 patterns",     status: "good" },
          { icon: "circle",      label: "Pick your values",   meta: "Needs your input",status: "warn" },
        ]},
        { title: "L2 · Sherlock", items: [
          { icon: "search-check", label: "Question everything", meta: "LOCKED · unlocks at L1 100%", status: "warn" },
          { icon: "lock",         label: "Deduction drills",    meta: "Locked" },
          { icon: "lock",         label: "Most probable provable truth", meta: "Locked" },
        ]},
      ],
    },

    // 3 · WORK — exact subsections from sot.md
    work: {
      title: "Work",
      badge: { count: 5, tone: "err" },
      sections: [
        { title: "Legal",      items: [ { icon: "scale",       label: "Contracts",         badge: { count: 3, tone: "warn" } }, { icon: "file-text", label: "Compliance review", meta: "Quarterly · due Jun 30" } ]},
        { title: "Finance",    items: [ { icon: "dollar-sign", label: "Q1 budget",         meta: "78% used",  status: "good" }, { icon: "trending-up", label: "Cash flow",       meta: "+$2,260 mo" } ]},
        { title: "Sales",      items: [ { icon: "trending-up", label: "Pipeline",          meta: "$182k · this month", status: "good" }, { icon: "users", label: "Leads",            badge: { count: 14 } } ]},
        { title: "Marketing",  items: [ { icon: "megaphone",   label: "Active campaigns",  badge: { count: 3, tone: "info" } }, { icon: "share-2",   label: "Channels",          meta: "4 networks" } ]},
        { title: "Operations", items: [ { icon: "settings-2",  label: "Systems status",    status: "good",    meta: "All green" }, { icon: "boxes",     label: "Inventory",         meta: "412 SKUs" } ]},
        { title: "Files",      items: [ { icon: "folder-tree", label: "Browse files",      view: "files", meta: "6 folders · 14 recent" } ]},
        { title: "Contacts",   items: [ { icon: "users", label: "Contacts", view: "contacts", meta: "24 people" } ]},
        { title: "Calendar",   items: [ { icon: "video",       label: "Team standup",      meta: "2:00 PM · 30 min",   status: "warn", view: "calendar" }, { icon: "video", label: "Client review", meta: "4:30 PM · 60 min", view: "calendar" } ]},
        { title: "Analytics",  items: [ { icon: "bar-chart-3", label: "KPIs",              meta: "Last 30 days" }, { icon: "trending-up", label: "Trends",          meta: "Weekly" } ]},
      ],
    },

    // 4 · PERSONAL (with Family) — exact subsections from sot.md
    personal: {
      title: "Personal",
      badge: { count: 2, tone: "info" },
      sections: [
        { title: "Family", items: [
          { icon: "heart", label: "Partner",  meta: "At home · Nearby",         status: "online" },
          { icon: "heart", label: "Kids",     meta: "At school · Safe zone",    status: "good" },
          { icon: "heart", label: "Parents",  meta: "Boston · 3:30 PM",         status: "online" },
          { icon: "users", label: "Family hub", meta: "Shared calendar + tasks" },
        ]},
        { title: "Finance",      items: [ { icon: "dollar-sign", label: "Net worth", meta: "Trending up", status: "good" }, { icon: "trending-up", label: "Cash flow", meta: "+$2,260 mo" } ]},
        { title: "Health",       items: [ { icon: "heart-pulse", label: "Health", view: "health", meta: "Sleep · Activity · Heart" } ]},
        { title: "Legal",        items: [ { icon: "scale",       label: "Will & estate", meta: "Current",     status: "good" }, { icon: "file-text", label: "Insurance",  meta: "Auto-renews Aug" } ]},
        { title: "Files",        items: [ { icon: "folder-tree", label: "Browse files",   view: "files", meta: "5 folders · 12 recent" } ]},
        { title: "Calendar",     items: [ { icon: "heart",       label: "Soccer pickup",  meta: "4:00 PM · today", view: "calendar" }, { icon: "moon", label: "Reading hour", meta: "8:00 PM · today", view: "calendar" } ]},
        { title: "Wallet",       items: [ { icon: "wallet",      label: "Chase Checking", meta: "$12,450.32",   status: "good" }, { icon: "credit-card", label: "Cards", badge: { count: 3 } } ]},
        { title: "Social Media", items: [ { icon: "share-2",     label: "4 accounts linked" }, { icon: "message-square", label: "Mentions", badge: { count: 12, tone: "err" } } ]},
        { title: "Contacts",     items: [ { icon: "users", label: "Contacts", view: "contacts", meta: "18 people" } ]},
      ],
    },

    // 5 · HOME AUTOMATION — exact subsections from sot.md
    home: {
      title: "Home Automation",
      sections: [
        { title: "IoT",            items: [ { icon: "wifi", label: "IoT devices", view: "iot", meta: "47 online · 32 ms avg" } ]},
        { title: "Appliances",     items: [ { icon: "plug", label: "Washer", meta: "Running · 18m left" }, { icon: "plug", label: "Dishwasher", meta: "Idle" } ]},
        { title: "TV",             items: [ { icon: "tv",   label: "Living room", meta: "Idle" }, { icon: "tv",   label: "Bedroom",     meta: "Off" } ]},
        { title: "Streaming",      items: [ { icon: "tv",   label: "Netflix",  meta: "Idle" }, { icon: "music",   label: "Spotify",   meta: "Living room · 32%", status: "online" } ]},
        { title: "Movies",         items: [ { icon: "film", label: "Watchlist", badge: { count: 18 } }, { icon: "film", label: "Recently watched", badge: { count: 6 } } ]},
        { title: "Photos",         items: [ { icon: "image",label: "Recent shots", meta: "Last 30d · 248" }, { icon: "image",label: "Memories",     meta: "On this day" } ]},
        { title: "Videos",         items: [ { icon: "video",label: "Cameras",   meta: "6 online",     status: "good" }, { icon: "video",label: "Recordings", meta: "8 clips · last week" } ]},
        { title: "Energy",         items: [ { icon: "zap",         label: "Power usage",  meta: "4.2 kWh now", status: "good" } ]},
        { title: "Gas",            items: [ { icon: "flame",       label: "Status",       meta: "Idle",        status: "good" } ]},
        { title: "Energy Storage", items: [ { icon: "battery-charging", label: "Battery", meta: "78%",         status: "good" } ]},
        { title: "Water",          items: [ { icon: "droplet",     label: "Flow",         meta: "Normal",      status: "good" } ]},
        { title: "Food",           items: [ { icon: "utensils",    label: "Pantry",       meta: "Restock list · 4 items", status: "warn" } ]},
        { title: "Irrigation",     items: [ { icon: "sprout",      label: "Next run",     meta: "Tue 6 AM" } ]},
        { title: "Lights",         items: [ { icon: "lamp",        label: "Lights",       meta: "8 of 24 on", view: "lights" } ]},
        { title: "Pool",           items: [ { icon: "waves",       label: "Heater",       meta: "Off · 78°F",  status: "good" } ]},
        { title: "Network",        items: [ { icon: "router",      label: "WiFi",         meta: "1.2 Gbps",    status: "good" } ]},
      ],
    },

    // 6 · MEDIA — exact subsections from sot.md
    media: {
      title: "Media",
      badge: { count: 4, tone: "ok" },
      sections: [
        { title: "Photos",    items: [ { icon: "image",  label: "Recents",       meta: "248 shots · last 30d" }, { icon: "image", label: "Albums",     badge: { count: 32 } } ]},
        { title: "Socials",   items: [ { icon: "share-2",label: "Posts to review", badge: { count: 3, tone: "info" } }, { icon: "message-square", label: "Mentions", badge: { count: 12, tone: "err" } } ]},
        { title: "Videos",    items: [ { icon: "film",   label: "Watchlist",     badge: { count: 18 } }, { icon: "tv",   label: "Continue watching", meta: "The Bear · S3 E5" } ]},
        { title: "Streaming", items: [ { icon: "music",  label: "Spotify",       meta: "Living room · 32%", status: "online" }, { icon: "headphones", label: "Podcasts", meta: "Lex Fridman · 1h 12m left" } ]},
      ],
    },
  },

  // ---------- SETTINGS / PROFILE (gear icon — side-panel pattern, NOT a workspace) ----------
  // Per user: click gear → second side panel opens with these sections; clicking a section
  // renders a per-subsection dashboard on the right.
  profile: {
    title: "Settings & Profile",
    sections: [
      { title: "Profile", items: [
        { icon: "user",      label: "Account",      meta: "alex@lifeos.ai" },
        { icon: "image",     label: "Avatar & display name" },
        { icon: "palette",   label: "Appearance",   meta: "Dark · gradient accents" },
        { icon: "globe",     label: "Language & region", meta: "English · America/Los_Angeles" },
      ]},
      { title: "Logins & passwords", items: [
        { icon: "key",       label: "Password vault",   badge: { count: 48 } },
        { icon: "key-round", label: "Passkeys",         badge: { count: 6, tone: "ok" } },
        { icon: "shield",    label: "Two-factor",       meta: "Authenticator + hardware key", status: "good" },
        { icon: "log-in",    label: "Active sessions",  meta: "4 devices" },
      ]},
      { title: "Secrets & keys", items: [
        { icon: "key",        label: "API keys",        badge: { count: 15, tone: "ok" } },
        { icon: "file-key",   label: "SSH keys",        badge: { count: 5 } },
        { icon: "file-key",   label: "PGP keys",        badge: { count: 2 } },
        { icon: "file-check", label: "SSL certificates",badge: { count: 3, tone: "ok" } },
      ]},
      { title: "Registry & env vars", items: [
        { icon: "database",   label: "Environment variables", badge: { count: 32 } },
        { icon: "settings-2", label: "System registry",       meta: "Local · synced" },
        { icon: "share-2",    label: "Connected services",    badge: { count: 18, tone: "info" } },
      ]},
      { title: "Hardware · compute", items: [
        { icon: "laptop",       label: "MacBook Pro 16",   meta: "M3 Max · 64 GB · primary", status: "online" },
        { icon: "monitor",      label: "Desktop · Linux",  meta: "Ryzen 9 · 128 GB",         status: "online" },
        { icon: "smartphone",   label: "iPhone 15 Pro",    meta: "iOS 18.4",                 status: "online" },
        { icon: "tablet",       label: "iPad Pro",         meta: "M2 · 1 TB",                status: "good" },
      ]},
      { title: "Hardware · storage", items: [
        { icon: "hard-drive", label: "Primary SSD",     meta: "2 TB · 38% used",  status: "good" },
        { icon: "hard-drive", label: "NAS",             meta: "16 TB · 71% used", status: "warn" },
        { icon: "cloud",      label: "Cloud backup",    meta: "Tier S · current", status: "good" },
        { icon: "database",   label: "RAM · per device",meta: "see compute list" },
      ]},
    ],
  },

  // ---------- HUBS (footer-icon panels that aren't aggregators) ----------
  // Contacts is NOT a workspace — it's a hub with explicit channel-based sections.
  // Each item opens a per-contact / per-thread dashboard on the right.
  hubs: {
    contacts: {
      title: "Contacts",
      sections: [
        { title: "Contacts", items: [
          { icon: "star",          label: "Sarah Chen",       meta: "Favorite · last spoke 2h",  status: "online" },
          { icon: "star",          label: "Marcus Lee",       meta: "Favorite · last spoke yesterday" },
          { icon: "user-plus",     label: "Add a contact",    meta: "New entry" },
          { icon: "users",         label: "All contacts",     meta: "428 people",                badge: { count: 428 } },
        ]},
        { title: "Messaging", items: [
          { icon: "message-square",label: "Engineering team", meta: "8 unread",                  badge: { count: 8, tone: "err" } },
          { icon: "message-square",label: "Family group",     meta: "2 unread",                  badge: { count: 2, tone: "info" } },
          { icon: "message-square",label: "DM · Alex Park",   meta: "Active now",                status: "online" },
          { icon: "send",          label: "Sent",             meta: "Today: 14" },
        ]},
        { title: "Email", items: [
          { icon: "mail",          label: "Inbox",            meta: "12 unread",                 badge: { count: 12, tone: "err" } },
          { icon: "inbox",         label: "Important",        meta: "3 needs reply",             status: "warn" },
          { icon: "send",          label: "Sent",             meta: "Today: 6" },
          { icon: "archive",       label: "Archive",          meta: "All time" },
        ]},
        { title: "Work", items: [
          { icon: "users",         label: "Engineering",      meta: "8 people",                  badge: { count: 8, tone: "ok" }, status: "online" },
          { icon: "users",         label: "Design",           meta: "3 people",                  badge: { count: 3, tone: "ok" } },
          { icon: "user",          label: "John Doe · Lead",  meta: "NYC · 2:30 PM",             status: "online" },
          { icon: "user",          label: "Jane Smith",       meta: "London · 7:30 PM",          status: "warn" },
        ]},
        { title: "Personal", items: [
          { icon: "heart",         label: "Partner",          meta: "At home · Nearby",          status: "online" },
          { icon: "heart",         label: "Kids",             meta: "At school · Safe zone",     status: "good" },
          { icon: "heart",         label: "Parents",          meta: "Boston · 3:30 PM",          status: "online" },
          { icon: "users",         label: "Family hub",       meta: "Shared calendar + tasks" },
        ]},
      ],
    },

    // Knowledge — the brain layer. All workspace data syncs here so the AI has perfect
    // recall. User edits memories directly from these subsections.
    knowledge: {
      title: "Knowledge",
      sections: [
        { title: "AI 1st brain", items: [
          { icon: "brain",         label: "Working memory",    meta: "Last 7 days · 4,218 records",   status: "online" },
          { icon: "zap",           label: "Active context",    meta: "What LifeOS knows right now",   status: "online" },
          { icon: "history",       label: "Recent decisions",  meta: "128 entries · last 24h" },
          { icon: "lightbulb",     label: "Live insights",     meta: "12 surfaced today",             badge: { count: 12, tone: "info" } },
        ]},
        { title: "AI 2nd brain", items: [
          { icon: "archive",       label: "Long-term memory",  meta: "Since 2023 · 84,512 records",   status: "good" },
          { icon: "bookmark",      label: "Pinned memories",   meta: "User-curated · 312" },
          { icon: "user-check",    label: "Identity model",    meta: "Values · habits · preferences", status: "good" },
          { icon: "calendar-days", label: "Life timeline",     meta: "Auto-built from events" },
        ]},
        { title: "Wiki brain", items: [
          { icon: "book-open",     label: "Notes",             meta: "1,402 entries",                 badge: { count: 1402 } },
          { icon: "file-text",     label: "Docs",              meta: "248 documents" },
          { icon: "library",       label: "Bookmarks",         meta: "892 links · tagged" },
          { icon: "edit",          label: "Drafts",            meta: "14 in progress" },
        ]},
        { title: "Vector DB", items: [
          { icon: "circle-dot",    label: "Embeddings",        meta: "1.2M vectors · 1536-d",         status: "good" },
          { icon: "search",        label: "Semantic search",   meta: "12 ms p50 latency",             status: "online" },
          { icon: "share-2",       label: "Similarity links",  meta: "Cross-workspace · auto" },
          { icon: "settings-2",    label: "Index health",      meta: "98.4% · last rebuild 6h ago",   status: "good" },
        ]},
        { title: "Postgres DB", items: [
          { icon: "database",      label: "Structured records",meta: "412,318 rows · 24 tables",      status: "online" },
          { icon: "key",           label: "Schemas",           meta: "people · events · entities" },
          { icon: "shield",        label: "Backups",           meta: "Daily · 30-day retention",      status: "good" },
          { icon: "activity",      label: "Query log",         meta: "Last query 12s ago" },
        ]},
        { title: "Graphs", items: [
          { icon: "git-branch",    label: "Knowledge graph",   meta: "84k nodes · 312k edges",        status: "online" },
          { icon: "users",         label: "Relationship map",  meta: "People + orgs + topics" },
          { icon: "trending-up",   label: "Cause / effect",    meta: "Inferred · weighted" },
          { icon: "compass",       label: "Explore",           meta: "Interactive viewer" },
        ]},
      ],
    },
  },
};

// ---------- AGGREGATORS (pure functions, called by footer workspaces) ----------
// Scan all workspaces for items matching a predicate, tag origin, return unified list.
window.LIFEOS_AGGREGATORS = {
  _scan(predicate) {
    const out = [];
    const ws = window.LIFEOS_DATA.workspaces;
    Object.keys(ws).forEach(wsId => {
      (ws[wsId].sections || []).forEach(sec => {
        (sec.items || []).forEach(item => {
          if (predicate(item, sec, ws[wsId])) {
            out.push({ ...item, _origin: { workspaceId: wsId, workspaceTitle: ws[wsId].title, section: sec.title } });
          }
        });
      });
    });
    return out;
  },

  // Calendar = every item whose section is "Calendar" OR whose icon is calendar/video and has time-like meta
  calendar() {
    return this._scan((item, sec) =>
      sec.title === "Calendar"
      || (sec.title === "Family" && /PM|AM/.test(item.meta || ""))
    );
  },

  // To-do = every item from a Goals / Tasks / Pending section, plus warn-state items
  todos() {
    return this._scan((item, sec) =>
      sec.title === "Goals"
      || sec.title === "Open tasks"
      || (item.status === "warn" && !item.label?.startsWith("Add"))
    );
  },

  // Contacts = every Contacts section + Family
  contacts() {
    return this._scan((item, sec) => sec.title === "Contacts" || sec.title === "Family");
  },

  // Knowledge = every Ideas / Memory / Notes section
  knowledge() {
    return this._scan((item, sec) =>
      sec.title === "Ideas" || sec.title === "Knowledge" || sec.title === "Notes"
    );
  },

  // Notifications = any warn/err status item
  notifications() {
    return this._scan((item) => item.status === "warn" || item.status === "err");
  },

  // Favorites = items explicitly marked favorite (none yet; placeholder for future "starred" flag)
  favorites() {
    return this._scan((item) => item.favorite === true);
  },
};

// ---------- N8N-STYLE AGENT WORKFLOW DEFINITIONS ----------
// Each Agent Team has a flow: nodes (agents) + edges (data hand-offs).
window.LIFEOS_FLOWS = {
  day: {
    title: "Day Captain — workflow",
    nodes: [
      { id: "trigger",    type: "trigger",  label: "Day starts · 6:30 AM",   icon: "sunrise"     },
      { id: "scheduler",  type: "agent",    label: "Scheduler",              icon: "calendar",     status: "online", note: "Booked 2 focus blocks" },
      { id: "routine",    type: "agent",    label: "Routine keeper",         icon: "list-todo",    status: "online", note: "Morning on track" },
      { id: "guardian",   type: "agent",    label: "Time guardian",          icon: "shield",       status: "good",   note: "Blocking deep work 10–12" },
      { id: "out",        type: "output",   label: "Today's plan · pushed",  icon: "check-circle" },
    ],
    edges: [["trigger","scheduler"],["scheduler","routine"],["routine","guardian"],["guardian","out"]],
  },
  inbox: {
    title: "Inbox Crew — workflow",
    nodes: [
      { id: "trigger",  type: "trigger", label: "New message",        icon: "mail" },
      { id: "email",    type: "agent",   label: "Email triage",       icon: "mail",          status: "online", note: "9 archived · 3 needs you" },
      { id: "slack",    type: "agent",   label: "Slack listener",     icon: "message-square",status: "online", note: "2 mentions · 1 reply drafted" },
      { id: "sms",      type: "agent",   label: "SMS gatekeeper",     icon: "phone",         status: "good",   note: "All clear" },
      { id: "reply",    type: "agent",   label: "Auto-reply",         icon: "send",          status: "warn",   note: "Awaiting tone tweaks" },
      { id: "out",      type: "output",  label: "Inbox at zero",      icon: "check-circle" },
    ],
    edges: [["trigger","email"],["trigger","slack"],["trigger","sms"],["email","reply"],["slack","reply"],["reply","out"],["sms","out"]],
  },
  research: {
    title: "Research Squad — workflow",
    nodes: [
      { id: "trigger",  type: "trigger", label: "Topic queued",       icon: "search" },
      { id: "web",      type: "agent",   label: "Web researcher",     icon: "globe",         status: "online", note: "Investigating Q1 partner" },
      { id: "summ",     type: "agent",   label: "Summarizer",         icon: "file-text",     status: "good",   note: "4 briefs ready" },
      { id: "fact",     type: "agent",   label: "Fact-checker",       icon: "shield-check",  status: "good",   note: "Verifying 2 claims" },
      { id: "out",      type: "output",  label: "Brief delivered",    icon: "file-check" },
    ],
    edges: [["trigger","web"],["web","summ"],["summ","fact"],["fact","out"]],
  },
  "home-ops": {
    title: "Home Ops — workflow",
    nodes: [
      { id: "trigger",  type: "trigger", label: "Sensor change",      icon: "radio" },
      { id: "climate",  type: "agent",   label: "Climate",            icon: "thermometer",   status: "good", note: "72°F · auto" },
      { id: "security", type: "agent",   label: "Security",           icon: "shield-alert",  status: "warn", note: "Garage open 30 min" },
      { id: "energy",   type: "agent",   label: "Energy",             icon: "zap",           status: "good", note: "Eco mode · saving 18%" },
      { id: "devices",  type: "agent",   label: "Devices",            icon: "cpu",           status: "good", note: "47 of 47 online" },
      { id: "scenes",   type: "agent",   label: "Scenes",             icon: "lamp",          status: "good", note: "Wind-down at 9:30 PM" },
      { id: "out",      type: "output",  label: "Home state · stable",icon: "home" },
    ],
    edges: [["trigger","climate"],["trigger","security"],["trigger","energy"],["trigger","devices"],["climate","scenes"],["security","scenes"],["energy","scenes"],["devices","scenes"],["scenes","out"]],
  },
  wellness: {
    title: "Wellness Crew — workflow",
    nodes: [
      { id: "trigger", type: "trigger", label: "Wearable sync",       icon: "activity" },
      { id: "coach",   type: "agent",   label: "Health coach",        icon: "heart-pulse",   status: "good",   note: "Workout streak · 12d" },
      { id: "family",  type: "agent",   label: "Family coordinator",  icon: "users",         status: "online", note: "Kids · safe zone" },
      { id: "sleep",   type: "agent",   label: "Sleep keeper",        icon: "moon",          status: "good",   note: "7h 12m avg" },
      { id: "out",     type: "output",  label: "Daily wellness brief",icon: "file-check" },
    ],
    edges: [["trigger","coach"],["trigger","family"],["trigger","sleep"],["coach","out"],["family","out"],["sleep","out"]],
  },
  finance: {
    title: "Finance Bench — workflow",
    nodes: [
      { id: "trigger",  type: "trigger", label: "Transaction · feed", icon: "wallet" },
      { id: "bills",    type: "agent",   label: "Bill pay",           icon: "receipt",       status: "warn", note: "AmEx due in 3 days" },
      { id: "flow",     type: "agent",   label: "Cash flow",          icon: "trending-up",   status: "good", note: "+$2,260 this month" },
      { id: "invest",   type: "agent",   label: "Investments",        icon: "bar-chart-3",   status: "good", note: "Rebalancing scheduled" },
      { id: "out",      type: "output",  label: "Books reconciled",   icon: "check-circle" },
    ],
    edges: [["trigger","bills"],["trigger","flow"],["trigger","invest"],["bills","out"],["flow","out"],["invest","out"]],
  },
};

// ---------- DASHBOARD MAIN ----------
window.LIFEOS_DATA.dashboardCanvas = {
  greeting: "Good afternoon, Alex.",
  sub: "Your AI ran 18 automations overnight across 6 agent teams. Here is what needs you.",
  stats: [
    { id: "work",     icon: "laptop",      label: "Work",     value: "87",  unit: "%",  delta: "+4.2",  tone: "cyan",   meta: "productivity today" },
    { id: "personal", icon: "heart",       label: "Personal", value: "92",  unit: "",   delta: "+3",    tone: "purple", meta: "health score · trending up" },
    { id: "home",     icon: "home",        label: "Home",     value: "72",  unit: "°F", delta: "eco",   tone: "green",  meta: "47 devices online" },
    { id: "media",    icon: "play-circle", label: "Media",    value: "4",   unit: "",   delta: "now",   tone: "cyan",   meta: "playing in 3 rooms" },
  ],
  teams: [
    { id: "day",       icon: "calendar",      name: "Day Captain",     status: "online", meta: "3 agents · scheduling",   counter: "+2 actions",  tone: "cyan",   flowId: "day"      },
    { id: "inbox",     icon: "inbox",         name: "Inbox Crew",      status: "online", meta: "4 agents · triaging",     counter: "12 unread",   tone: "purple", flowId: "inbox"    },
    { id: "research",  icon: "search",        name: "Research Squad",  status: "online", meta: "3 agents · 4 briefs",     counter: "4 ready",     tone: "cyan",   flowId: "research" },
    { id: "home-ops",  icon: "home",          name: "Home Ops",        status: "warn",   meta: "5 agents · 1 alert",      counter: "1 issue",     tone: "green",  flowId: "home-ops" },
    { id: "wellness",  icon: "heart-pulse",   name: "Wellness Crew",   status: "online", meta: "3 agents · you + family", counter: "all good",    tone: "purple", flowId: "wellness" },
    { id: "finance",   icon: "wallet",        name: "Finance Bench",   status: "online", meta: "3 agents · money + bills",counter: "2 due soon",  tone: "green",  flowId: "finance"  },
  ],
  activity: [
    { time: "2m",  icon: "check-circle",  tone: "ok",   title: "Task completed",   meta: "Day Captain · cleared inbox to zero" },
    { time: "5m",  icon: "shield-alert",  tone: "warn", title: "Security alert",   meta: "Home Ops · front door open 30 min" },
    { time: "12m", icon: "sparkles",      tone: "info", title: "AI suggested",     meta: "Day Captain · move 3 meetings to enable deep work" },
    { time: "1h",  icon: "zap",           tone: "warn", title: "Energy spike",     meta: "Home Ops · kitchen circuit · investigating" },
    { time: "2h",  icon: "heart",         tone: "ok",   title: "Family update",    meta: "Wellness Crew · kids arrived at school safely" },
  ],
  agenda: [
    { day: "Today",    time: "2:00 PM",  title: "Team standup",       tag: "Work",     tone: "cyan"   },
    { day: "Today",    time: "4:00 PM",  title: "Soccer pickup",      tag: "Family",   tone: "purple" },
    { day: "Today",    time: "6:30 PM",  title: "Evening scene",      tag: "Home",     tone: "green"  },
    { day: "Today",    time: "8:00 PM",  title: "Reading hour",       tag: "Personal", tone: "cyan"   },
    { day: "Tomorrow", time: "9:00 AM",  title: "Client review",      tag: "Work",     tone: "cyan"   },
    { day: "Tomorrow", time: "12:30 PM", title: "Lunch with partner", tag: "Family",   tone: "purple" },
    { day: "Wed",      time: "10:00 AM", title: "1:1 with John",      tag: "Work",     tone: "cyan"   },
    { day: "Wed",      time: "7:00 PM",  title: "Family dinner",      tag: "Family",   tone: "purple" },
    { day: "Thu",      time: "11:00 AM", title: "Quarterly review",   tag: "Work",     tone: "cyan"   },
    { day: "Thu",      time: "5:00 PM",  title: "Gym session",        tag: "Personal", tone: "cyan"   },
    { day: "Fri",      time: "9:30 AM",  title: "Team retrospective", tag: "Work",     tone: "cyan"   },
    { day: "Fri",      time: "3:00 PM",  title: "School pickup",      tag: "Family",   tone: "purple" },
    { day: "Sat",      time: "10:00 AM", title: "Farmers market",     tag: "Personal", tone: "cyan"   },
    { day: "Sun",      time: "2:00 PM",  title: "Meal prep",          tag: "Home",     tone: "green"  },
    { day: "Sun",      time: "7:30 PM",  title: "Week review",        tag: "Personal", tone: "cyan"   },
  ],
};

// ---------- LIGHTING (Home → Lights subsection dashboard) ----------
// Consumed by src/components/LightsView.vue when activeSub.item.view === "lights".
// Sample data: 3 rooms, 12 lights, 4 scenes, 2 schedules. Static-first; toggling
// is wired but does not persist yet — Phase 5 will surface a "coming soon" note.
window.LIFEOS_DATA.lighting = {
  scenes: [
    { id: "focus",  label: "Focus",  icon: "zap",  active: true,  gradient: "linear-gradient(135deg, rgba(0,212,255,.30) 0%, rgba(0,212,255,.06) 100%)" },
    { id: "cinema", label: "Cinema", icon: "film", active: false, gradient: "linear-gradient(135deg, rgba(155,123,255,.30) 0%, rgba(155,123,255,.06) 100%)" },
    { id: "glow",   label: "Glow",   icon: "sun",  active: false, gradient: "linear-gradient(135deg, rgba(0,230,118,.30) 0%, rgba(0,230,118,.06) 100%)" },
    { id: "sleep",  label: "Sleep",  icon: "moon", active: false, gradient: "linear-gradient(135deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,0) 100%)" },
  ],
  rooms: [
    {
      id: "living", label: "Living Room", icon: "sofa", activeCount: 3,
      devices: [
        { id: "l1", label: "Media Strip",  type: "strip",   isOn: true,  brightness: 80, tone: "cyan",   colorTemp: 3000 },
        { id: "l2", label: "Corner Lamp",  type: "lamp",    isOn: true,  brightness: 40, tone: "purple", colorTemp: 2700 },
        { id: "l3", label: "Ceiling 1",    type: "bulb",    isOn: true,  brightness: 100,                colorTemp: 4000 },
        { id: "l4", label: "Ceiling 2",    type: "bulb",    isOn: false, brightness: 0,                  colorTemp: 4000 },
        { id: "l5", label: "Ceiling 3",    type: "bulb",    isOn: false, brightness: 0,                  colorTemp: 4000 },
      ],
    },
    {
      id: "bed", label: "Bedroom", icon: "bed", activeCount: 1,
      devices: [
        { id: "b1", label: "Reading Light", type: "lamp", isOn: true,  brightness: 20, colorTemp: 2700 },
        { id: "b2", label: "Nightstand L",  type: "lamp", isOn: false, brightness: 0,  colorTemp: 2400 },
        { id: "b3", label: "Nightstand R",  type: "lamp", isOn: false, brightness: 0,  colorTemp: 2400 },
      ],
    },
    {
      id: "kitchen", label: "Kitchen", icon: "utensils", activeCount: 0,
      devices: [
        { id: "k1", label: "Island 1",    type: "pendant", isOn: false, brightness: 0, colorTemp: 4000 },
        { id: "k2", label: "Island 2",    type: "pendant", isOn: false, brightness: 0, colorTemp: 4000 },
        { id: "k3", label: "Under-cab L", type: "strip",   isOn: false, brightness: 0, colorTemp: 5000 },
        { id: "k4", label: "Under-cab R", type: "strip",   isOn: false, brightness: 0, colorTemp: 5000 },
      ],
    },
  ],
  schedules: [
    { id: "s1", label: "Morning wake",      time: "07:00 AM", days: "Mon–Fri", sceneId: "focus",  enabled: true },
    { id: "s2", label: "Evening wind-down", time: "09:30 PM", days: "Daily",   sceneId: "cinema", enabled: true },
  ],
};

// ---------- FILES (Work → Files  +  Personal → Files subsection dashboards) ----------
// Consumed by src/components/FilesView.vue when activeSub.item.view === "files".
// Keyed by workspace id ("work" | "personal"). Each workspace carries folders[] + recent[].
// recent[].folderId links rows to the folder list for filtering.
window.LIFEOS_DATA.files = {
  work: {
    folders: [
      { id: "wf-src",    label: "src",             icon: "folder",      count: 18 },
      { id: "wf-tests",  label: "tests",           icon: "folder",      count: 11 },
      { id: "wf-docs",   label: "docs",            icon: "folder-open", count: 4  },
      { id: "wf-config", label: "config",          icon: "folder",      count: 6  },
      { id: "wf-assets", label: "assets",          icon: "folder",      count: 23 },
      { id: "wf-deploy", label: "deploy",          icon: "folder",      count: 3  },
    ],
    recent: [
      { id: "wr01", label: "App.vue",            path: "src/App.vue",                    modified: "5m ago",   size: "1 KB",   kind: "vue",  folderId: "wf-src"    },
      { id: "wr02", label: "FilesView.vue",      path: "src/components/FilesView.vue",   modified: "12m ago",  size: "4 KB",   kind: "vue",  folderId: "wf-src"    },
      { id: "wr03", label: "LightsView.vue",     path: "src/components/LightsView.vue",  modified: "1h ago",   size: "11 KB",  kind: "vue",  folderId: "wf-src"    },
      { id: "wr04", label: "lifeos_app.css",     path: "lifeos_app.css",                 modified: "1h ago",   size: "80 KB",  kind: "css",  folderId: "wf-assets" },
      { id: "wr05", label: "data.js",            path: "data.js",                        modified: "2h ago",   size: "44 KB",  kind: "js",   folderId: "wf-src"    },
      { id: "wr06", label: "types.ts",           path: "src/data/types.ts",              modified: "2h ago",   size: "5 KB",   kind: "ts",   folderId: "wf-src"    },
      { id: "wr07", label: "FilesView.spec.js",  path: "tests/FilesView.spec.js",        modified: "2h ago",   size: "3 KB",   kind: "js",   folderId: "wf-tests"  },
      { id: "wr08", label: "setup.js",           path: "tests/setup.js",                 modified: "3h ago",   size: "5 KB",   kind: "js",   folderId: "wf-tests"  },
      { id: "wr09", label: "package.json",       path: "package.json",                   modified: "1d ago",   size: "924 B",  kind: "json", folderId: "wf-config" },
      { id: "wr10", label: "vite.config.ts",     path: "vite.config.ts",                 modified: "1d ago",   size: "1 KB",   kind: "ts",   folderId: "wf-config" },
      { id: "wr11", label: "README.md",          path: "README.md",                      modified: "2d ago",   size: "6 KB",   kind: "md",   folderId: "wf-docs"   },
      { id: "wr12", label: "AUDIT.md",           path: "AUDIT.md",                       modified: "3d ago",   size: "17 KB",  kind: "md",   folderId: "wf-docs"   },
      { id: "wr13", label: "index.html",         path: "index.html",                     modified: "4d ago",   size: "563 B",  kind: "html", folderId: "wf-assets" },
      { id: "wr14", label: "Cargo.toml",         path: "src-tauri/Cargo.toml",           modified: "5d ago",   size: "2 KB",   kind: "toml", folderId: "wf-config" },
    ],
  },
  personal: {
    folders: [
      { id: "pf-docs",    label: "Documents",    icon: "folder",      count: 24 },
      { id: "pf-photos",  label: "Photos",       icon: "image",       count: 248 },
      { id: "pf-finance", label: "Finance",      icon: "folder",      count: 8  },
      { id: "pf-health",  label: "Health",       icon: "folder",      count: 5  },
      { id: "pf-travel",  label: "Travel",       icon: "folder-open", count: 12 },
    ],
    recent: [
      { id: "pr01", label: "notes.md",           path: "Documents/notes.md",             modified: "20m ago",  size: "12 KB",  kind: "md",   folderId: "pf-docs"    },
      { id: "pr02", label: "vacation.png",       path: "Photos/vacation.png",            modified: "2h ago",   size: "3.2 MB", kind: "png",  folderId: "pf-photos"  },
      { id: "pr03", label: "budget-2026.json",   path: "Finance/budget-2026.json",       modified: "1d ago",   size: "8 KB",   kind: "json", folderId: "pf-finance" },
      { id: "pr04", label: "resume.pdf",         path: "Documents/resume.pdf",           modified: "1w ago",   size: "128 KB", kind: "pdf",  folderId: "pf-docs"    },
      { id: "pr05", label: "lab-results.pdf",    path: "Health/lab-results.pdf",         modified: "2w ago",   size: "240 KB", kind: "pdf",  folderId: "pf-health"  },
      { id: "pr06", label: "italy-plan.md",      path: "Travel/italy-plan.md",           modified: "3d ago",   size: "6 KB",   kind: "md",   folderId: "pf-travel"  },
      { id: "pr07", label: "family-2025.png",    path: "Photos/family-2025.png",         modified: "4d ago",   size: "4.8 MB", kind: "png",  folderId: "pf-photos"  },
      { id: "pr08", label: "will-draft.pdf",     path: "Documents/will-draft.pdf",       modified: "1mo ago",  size: "64 KB",  kind: "pdf",  folderId: "pf-docs"    },
      { id: "pr09", label: "insurance.pdf",      path: "Documents/insurance.pdf",        modified: "2mo ago",  size: "512 KB", kind: "pdf",  folderId: "pf-docs"    },
      { id: "pr10", label: "receipts.json",      path: "Finance/receipts.json",          modified: "5d ago",   size: "22 KB",  kind: "json", folderId: "pf-finance" },
      { id: "pr11", label: "hotel-conf.pdf",     path: "Travel/hotel-conf.pdf",          modified: "6d ago",   size: "94 KB",  kind: "pdf",  folderId: "pf-travel"  },
      { id: "pr12", label: "sunset-2025.png",    path: "Photos/sunset-2025.png",         modified: "1w ago",   size: "2.1 MB", kind: "png",  folderId: "pf-photos"  },
    ],
  },
};

// ---------- HEALTH (Personal → Health subsection dashboard) ----------
// Consumed by src/components/HealthView.vue when activeSub.item.view === "health".
// Metrics, sleep history (7 nights), activity rings (7 days), heart-rate samples (today).
window.LIFEOS_DATA.health = {
  metrics: [
    { id: "steps",  icon: "footprints",  label: "Steps",       value: "8,432", unit: "today",       delta: "+12% vs avg", tone: "cyan"   },
    { id: "sleep",  icon: "moon",        label: "Sleep",       value: "7.2h",  unit: "last night",  delta: "92% quality", tone: "purple" },
    { id: "heart",  icon: "heart-pulse", label: "Resting HR",  value: "62",    unit: "bpm",         delta: "in range",    tone: "green"  },
    { id: "active", icon: "activity",    label: "Active mins", value: "47",    unit: "today",       delta: "goal: 60",    tone: "warn"   },
  ],

  // Sleep — 7 nights of duration in hours + quality score
  sleep: [
    { day: "Mon", hours: 6.8, quality: 88 },
    { day: "Tue", hours: 7.4, quality: 91 },
    { day: "Wed", hours: 6.2, quality: 82 },
    { day: "Thu", hours: 7.9, quality: 94 },
    { day: "Fri", hours: 6.5, quality: 86 },
    { day: "Sat", hours: 8.1, quality: 96 },
    { day: "Sun", hours: 7.2, quality: 92 },
  ],

  // Activity rings per day: move (cal), exercise (min), stand (hr)
  activity: [
    { day: "Mon", move: 420, exercise: 30, stand: 10 },
    { day: "Tue", move: 510, exercise: 45, stand: 12 },
    { day: "Wed", move: 380, exercise: 20, stand:  9 },
    { day: "Thu", move: 560, exercise: 55, stand: 13 },
    { day: "Fri", move: 490, exercise: 40, stand: 11 },
    { day: "Sat", move: 640, exercise: 62, stand: 14 },
    { day: "Sun", move: 480, exercise: 47, stand: 11 },
  ],

  // Heart rate samples through today (hour + bpm)
  heart: [
    { time: "06:00", bpm: 58 },
    { time: "07:00", bpm: 65 },
    { time: "08:00", bpm: 72 },
    { time: "09:00", bpm: 78 },
    { time: "10:00", bpm: 68 },
    { time: "12:00", bpm: 74 },
    { time: "14:00", bpm: 70 },
    { time: "16:00", bpm: 85 },
    { time: "18:00", bpm: 76 },
    { time: "20:00", bpm: 62 },
  ],
};

// ---------- NOTIFICATIONS (persistent inbox, opened from the bell icon in the rail footer) ----------
// Consumed by src/components/NotificationsDrawer.vue.
// tone: cyan | purple | green | warn | err
// link.workspaceId + link.sectionTitle + link.itemLabel are optional deep links.
window.LIFEOS_DATA.notifications = [
  {
    id: "n01", ts: "2m ago",  icon: "check-circle", tone: "green",
    title: "Day Captain completed morning plan",
    body:  "12 tasks scheduled · 2 flagged for your review.",
    source: "Day Captain", unread: true,
    link: { workspaceId: "ai", sectionTitle: "Agent Teams", itemLabel: "Day Captain" },
  },
  {
    id: "n02", ts: "8m ago",  icon: "alert-triangle", tone: "warn",
    title: "Grocery restock needed",
    body:  "Milk, eggs and coffee are below threshold.",
    source: "Home Ops", unread: true,
    link: { workspaceId: "home", sectionTitle: "Pantry", itemLabel: "Grocery list" },
  },
  {
    id: "n03", ts: "14m ago", icon: "heart-pulse", tone: "cyan",
    title: "Morning wellness check-in",
    body:  "Resting heart rate 62 bpm · sleep score 84.",
    source: "Wellness Crew", unread: true,
  },
  {
    id: "n04", ts: "31m ago", icon: "sparkles",       tone: "purple",
    title: "AI insight ready",
    body:  "3 recurring meeting patterns identified — tap to review.",
    source: "AI Command Center", unread: true,
    link: { workspaceId: "ai", sectionTitle: "Goals", itemLabel: "Q1 product launch" },
  },
  {
    id: "n05", ts: "1h ago",  icon: "file-text",      tone: "cyan",
    title: "Resume updated by Docs agent",
    body:  "resume.pdf re-exported with 2026 work history.",
    source: "Files", unread: true,
    link: { workspaceId: "personal", sectionTitle: "Documents", itemLabel: "resume.pdf" },
  },
  {
    id: "n06", ts: "2h ago",  icon: "zap",            tone: "warn",
    title: "Energy spike detected",
    body:  "Kitchen circuits drew 3.4 kW at 01:12 — may be the dishwasher.",
    source: "Home Ops", unread: true,
  },
  {
    id: "n07", ts: "3h ago",  icon: "check",          tone: "green",
    title: "Standup notes filed",
    body:  "Today's standup transcript saved to Work / Today.",
    source: "Work", unread: false,
    link: { workspaceId: "work", sectionTitle: "Today", itemLabel: "Standup" },
  },
  {
    id: "n08", ts: "4h ago",  icon: "shield-check",  tone: "green",
    title: "Security scan passed",
    body:  "No threats found across 14 endpoints.",
    source: "AI Command Center", unread: false,
  },
  {
    id: "n09", ts: "5h ago",  icon: "calendar",       tone: "cyan",
    title: "Client review added to calendar",
    body:  "Tomorrow 9:00 AM · added by Day Captain.",
    source: "Day Captain", unread: false,
    link: { workspaceId: "work", sectionTitle: "Today", itemLabel: "Client review" },
  },
  {
    id: "n10", ts: "6h ago",  icon: "moon",           tone: "purple",
    title: "Wind-down scene activated",
    body:  "Lights dimmed · bedroom 22 % · living room off.",
    source: "Home Ops", unread: false,
  },
  {
    id: "n11", ts: "Yesterday", icon: "trending-up",  tone: "cyan",
    title: "Weekly progress report",
    body:  "Goal completion 88 % · up 4 pts from last week.",
    source: "AI Command Center", unread: false,
  },
  {
    id: "n12", ts: "Yesterday", icon: "shield-alert", tone: "err",
    title: "VPN disconnected briefly",
    body:  "Kill switch fired for 4 s at 23:07 · reconnected.",
    source: "Home Ops", unread: false,
  },
];

// ---------- IOT (Home → IoT subsection dashboard) ----------
// Consumed by src/components/IoTView.vue when activeSub.item.view === "iot".
// Rooms, devices (status/latency/battery), network signal rings.
window.LIFEOS_DATA.iot = {
  rooms: [
    { id: "living",  label: "Living room", icon: "sofa",     online: 8,  total: 8  },
    { id: "bed",     label: "Bedroom",     icon: "bed",      online: 5,  total: 6  },
    { id: "kitchen", label: "Kitchen",     icon: "utensils", online: 7,  total: 7  },
    { id: "office",  label: "Office",      icon: "monitor",  online: 9,  total: 10 },
    { id: "garage",  label: "Garage",      icon: "car",      online: 4,  total: 4  },
    { id: "outdoor", label: "Outdoor",     icon: "trees",    online: 14, total: 14 },
  ],
  devices: [
    { id: "d01", roomId: "living",  label: "Smart TV",      type: "tv",      online: true,  latencyMs: 12, signal: 96, battery: null, lastSeen: "just now" },
    { id: "d02", roomId: "living",  label: "Soundbar",      type: "audio",   online: true,  latencyMs: 8,  signal: 92, battery: null, lastSeen: "just now" },
    { id: "d03", roomId: "bed",     label: "Thermostat",    type: "climate", online: true,  latencyMs: 22, signal: 84, battery: 78,   lastSeen: "20 s ago" },
    { id: "d04", roomId: "bed",     label: "Air sensor",    type: "sensor",  online: false, latencyMs: 0,  signal: 0,  battery: 12,   lastSeen: "8 min ago" },
    { id: "d05", roomId: "kitchen", label: "Smart display", type: "display", online: true,  latencyMs: 15, signal: 90, battery: null, lastSeen: "just now" },
    { id: "d06", roomId: "kitchen", label: "Leak sensor",   type: "sensor",  online: true,  latencyMs: 31, signal: 78, battery: 55,   lastSeen: "1 min ago" },
    { id: "d07", roomId: "office",  label: "Desk lamp",     type: "light",   online: true,  latencyMs: 9,  signal: 95, battery: null, lastSeen: "just now" },
    { id: "d08", roomId: "office",  label: "Air quality",   type: "sensor",  online: false, latencyMs: 0,  signal: 0,  battery: 8,    lastSeen: "22 min ago" },
    { id: "d09", roomId: "garage",  label: "Door sensor",   type: "sensor",  online: true,  latencyMs: 44, signal: 72, battery: 61,   lastSeen: "5 min ago" },
    { id: "d10", roomId: "garage",  label: "Motion",        type: "sensor",  online: true,  latencyMs: 38, signal: 68, battery: 34,   lastSeen: "3 min ago" },
    { id: "d11", roomId: "outdoor", label: "Weather station",type: "sensor", online: true,  latencyMs: 55, signal: 64, battery: 82,   lastSeen: "2 min ago" },
    { id: "d12", roomId: "outdoor", label: "Sprinkler ctrl",type: "control", online: true,  latencyMs: 48, signal: 70, battery: null, lastSeen: "just now" },
    { id: "d13", roomId: "living",  label: "Smart plug",    type: "plug",    online: true,  latencyMs: 11, signal: 93, battery: null, lastSeen: "just now" },
    { id: "d14", roomId: "bed",     label: "Smart speaker", type: "audio",   online: true,  latencyMs: 18, signal: 88, battery: null, lastSeen: "just now" },
  ],
  signals: [
    { id: "wan",    label: "WAN",       bars: 5, kind: "primary",   meta: "1.2 Gbps" },
    { id: "wifi5",  label: "Wi-Fi 5",   bars: 4, kind: "secondary", meta: "Living, Office" },
    { id: "wifi2",  label: "Wi-Fi 2.4", bars: 3, kind: "secondary", meta: "Garage, Outdoor" },
    { id: "mesh",   label: "Mesh nodes",bars: 5, kind: "primary",   meta: "4 nodes" },
  ],
};

// ---------- CONTACTS (Work → Contacts  +  Personal → Contacts subsection dashboards) ----------
// Consumed by src/components/ContactsView.vue when activeSub.item.view === "contacts"
// OR when activeId === "contacts" (rail-footer aggregator).
// avatarTone drives the initials circle: "cyan" | "purple" | "green".
// lastSeen: relative string. channel: primary reach-out method ("mail" | "phone" | "message-square").
window.LIFEOS_DATA.contacts = {
  work: [
    { id: "wc01", name: "Priya Nair",        role: "Engineering Lead",    organisation: "Acme Corp",   email: "priya@acmecorp.io",   phone: "+1 415 555 0101", avatarTone: "cyan",   lastSeen: "2m ago",   channel: "mail",           starred: true  },
    { id: "wc02", name: "Marcus Johansson",  role: "Product Manager",     organisation: "Acme Corp",   email: "marcus@acmecorp.io",  phone: "+1 415 555 0102", avatarTone: "purple", lastSeen: "1h ago",   channel: "message-square", starred: true  },
    { id: "wc03", name: "Leila Osei",        role: "Design Director",     organisation: "Acme Corp",   email: "leila@acmecorp.io",   phone: "+1 415 555 0103", avatarTone: "green",  lastSeen: "3h ago",   channel: "mail",           starred: false },
    { id: "wc04", name: "Dan Reinholt",      role: "Sales Lead",          organisation: "Acme Corp",   email: "dan@acmecorp.io",     phone: "+1 415 555 0104", avatarTone: "cyan",   lastSeen: "Yesterday", channel: "phone",          starred: false },
    { id: "wc05", name: "Sofia Vasquez",     role: "Legal Counsel",       organisation: "LawFirm LLC", email: "sofia@lawfirm.com",   phone: "+1 212 555 0201", avatarTone: "purple", lastSeen: "2d ago",   channel: "mail",           starred: true  },
    { id: "wc06", name: "Alex Chen",         role: "DevOps Engineer",     organisation: "Acme Corp",   email: "alex.c@acmecorp.io",  phone: "+1 415 555 0105", avatarTone: "green",  lastSeen: "4h ago",   channel: "message-square", starred: false },
    { id: "wc07", name: "Ingrid Larsson",    role: "Finance Manager",     organisation: "Acme Corp",   email: "ingrid@acmecorp.io",  phone: "+1 415 555 0106", avatarTone: "cyan",   lastSeen: "1w ago",   channel: "mail",           starred: false },
    { id: "wc08", name: "Tobias Meier",      role: "Marketing Lead",      organisation: "Acme Corp",   email: "tobias@acmecorp.io",  phone: "+1 415 555 0107", avatarTone: "purple", lastSeen: "3d ago",   channel: "mail",           starred: false },
  ],
  personal: [
    { id: "pc01", name: "Jamie Rivera",      role: "Close friend",        organisation: "",            email: "jamie@gmail.com",     phone: "+1 650 555 0301", avatarTone: "purple", lastSeen: "10m ago",  channel: "message-square", starred: true  },
    { id: "pc02", name: "Taylor Brooks",     role: "Neighbour",           organisation: "",            email: "tbrooks@gmail.com",   phone: "+1 650 555 0302", avatarTone: "green",  lastSeen: "6h ago",   channel: "phone",          starred: true  },
    { id: "pc03", name: "Dr. Amara Diallo",  role: "GP",                  organisation: "City Health", email: "adiallo@cityhealth.org", phone: "+1 650 555 0303", avatarTone: "cyan", lastSeen: "2w ago", channel: "phone",          starred: true  },
    { id: "pc04", name: "Chris Nakamura",    role: "Trainer",             organisation: "FitLife Gym", email: "chris@fitlife.com",   phone: "+1 650 555 0304", avatarTone: "green",  lastSeen: "Yesterday", channel: "message-square", starred: false },
    { id: "pc05", name: "Fatima Al-Rashid",  role: "School contact",      organisation: "Lincoln Elem",email: "fatima@lincoln.edu",  phone: "+1 650 555 0305", avatarTone: "purple", lastSeen: "3d ago",   channel: "mail",           starred: false },
    { id: "pc06", name: "Oliver Petrov",     role: "Accountant",          organisation: "Petrov CPA",  email: "oliver@petrovcpa.com",phone: "+1 650 555 0306", avatarTone: "cyan",   lastSeen: "1mo ago",  channel: "mail",           starred: false },
    { id: "pc07", name: "Nia Okafor",        role: "Friend",              organisation: "",            email: "nia.okafor@gmail.com",phone: "+1 650 555 0307", avatarTone: "purple", lastSeen: "5d ago",   channel: "message-square", starred: false },
    { id: "pc08", name: "Raj Patel",         role: "Car mechanic",        organisation: "Patel Auto",  email: "raj@patelauto.com",   phone: "+1 650 555 0308", avatarTone: "cyan",   lastSeen: "2mo ago",  channel: "phone",          starred: false },
  ],
};
