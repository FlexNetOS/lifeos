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
        { title: "Files",      items: [ { icon: "folder",      label: "Recent",            badge: { count: 14 } }, { icon: "folder-open", label: "Shared with team",   badge: { count: 38 } } ]},
        { title: "Contacts",   items: [ { icon: "users",       label: "Engineering",       badge: { count: 8, tone: "ok" }, status: "online" }, { icon: "users", label: "Design", badge: { count: 3, tone: "ok" } } ]},
        { title: "Calendar",   items: [ { icon: "video",       label: "Team standup",      meta: "2:00 PM · 30 min",   status: "warn" }, { icon: "video", label: "Client review", meta: "4:30 PM · 60 min" } ]},
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
        { title: "Health",       items: [ { icon: "activity",    label: "Health score", meta: "92 · trending up", status: "good" }, { icon: "moon", label: "Sleep", meta: "7h 12m avg" } ]},
        { title: "Legal",        items: [ { icon: "scale",       label: "Will & estate", meta: "Current",     status: "good" }, { icon: "file-text", label: "Insurance",  meta: "Auto-renews Aug" } ]},
        { title: "Files",        items: [ { icon: "folder",      label: "Personal docs",  badge: { count: 6 } }, { icon: "image", label: "Photos & memories", meta: "12,438 in library" } ]},
        { title: "Calendar",     items: [ { icon: "heart",       label: "Soccer pickup",  meta: "4:00 PM · today" }, { icon: "moon", label: "Reading hour", meta: "8:00 PM · today" } ]},
        { title: "Wallet",       items: [ { icon: "wallet",      label: "Chase Checking", meta: "$12,450.32",   status: "good" }, { icon: "credit-card", label: "Cards", badge: { count: 3 } } ]},
        { title: "Social Media", items: [ { icon: "share-2",     label: "4 accounts linked" }, { icon: "message-square", label: "Mentions", badge: { count: 12, tone: "err" } } ]},
        { title: "Contacts",     items: [ { icon: "users",       label: "Personal",      badge: { count: 86 } }, { icon: "star", label: "Favorites",  badge: { count: 12 } } ]},
      ],
    },

    // 5 · HOME AUTOMATION — exact subsections from sot.md
    home: {
      title: "Home Automation",
      sections: [
        { title: "IoT",            items: [ { icon: "wifi", label: "47 devices online", status: "good" }, { icon: "circle", label: "Latency", meta: "32 ms avg" } ]},
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
        { title: "Lights",         items: [ { icon: "lamp",        label: "On",           meta: "8 of 24 on" } ]},
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
    { time: "2:00 PM", title: "Team standup",  tag: "Work",     tone: "cyan"   },
    { time: "4:00 PM", title: "Soccer pickup", tag: "Family",   tone: "purple" },
    { time: "6:30 PM", title: "Evening scene", tag: "Home",     tone: "green"  },
    { time: "8:00 PM", title: "Reading hour",  tag: "Personal", tone: "cyan"   },
  ],
};
