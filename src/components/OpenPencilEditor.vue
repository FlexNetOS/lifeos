<script setup>
// LifeOS — OpenPencilEditor SFC
// In-app surface for github.com/FlexNetOS/open-pencil/tree/develop.
// Renders the editor's UI vocabulary as a mock — tool palette · canvas · inspector ·
// AI chat strip. The real Skia/CanvasKit runtime is embedded via iframe when available;
// when not, falls back to a static placeholder so the rest of the prototype keeps working.

import { ref, computed, onMounted, watch } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useNav } from "@/lib/nav.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();
const nav = useNav();
const props = defineProps({ sub: { type: Object, required: true } });
defineEmits(["close"]);

const item = computed(() => props.sub?.item || {});
const pane = computed(() => item.value.pane || "canvas");

// File-system tree built from the Files section in data.js.
// Each file in data.js Files has a `path` like "src/components/Badge.vue".
// We derive an in-memory folder tree on demand.
const fileItems = computed(() => {
  const ai = (window).LIFEOS_DATA?.workspaces?.ai?.sections || [];
  const files = ai.find(s => s.title === "Files")?.items || [];
  return files.filter(f => f.path);
});

const fileTree = computed(() => {
  const root = { name: "/", type: "dir", children: [] };
  const find = (parent, name) => {
    let n = parent.children.find(c => c.name === name && c.type === "dir");
    if (!n) {
      n = { name, type: "dir", children: [], path: (parent.path ? parent.path + "/" : "") + name };
      parent.children.push(n);
    }
    return n;
  };
  for (const f of fileItems.value) {
    const parts = f.path.split("/");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) cur = find(cur, parts[i]);
    cur.children.push({ name: parts[parts.length - 1], type: "file", path: f.path, icon: f.icon, meta: f.meta });
  }
  // sort: dirs first, then files; alpha within each
  const sort = (n) => {
    if (n.type !== "dir") return;
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sort);
  };
  sort(root);
  return root;
});

// Auto-expand folders that contain the active file
const expandedDirs = ref(new Set(["src", "src/components", "src/stores", "src/lib", "src-tauri", "src-tauri/src", "tests"]));
const toggleDir = (path) => {
  const s = new Set(expandedDirs.value);
  if (s.has(path)) s.delete(path); else s.add(path);
  expandedDirs.value = s;
};

// Flatten tree into a render list, respecting expandedDirs. Avoids self-recursive SFC.
const flatTree = computed(() => {
  const rows = [];
  const walk = (node, level) => {
    if (node.type === "dir") {
      // Skip the synthetic root row
      if (level > 0) rows.push({ kind: "dir", level, name: node.name, path: node.path, count: node.children.length });
      if (level === 0 || expandedDirs.value.has(node.path)) {
        for (const child of node.children) walk(child, level + 1);
      }
    } else {
      rows.push({ kind: "file", level, name: node.name, path: node.path, icon: node.icon });
    }
  };
  walk(fileTree.value, 0);
  return rows;
});

// Active file
const activePath = computed(() => item.value.path || null);
// Active folder (when clicking a folder in the tree)
const activeFolder = ref(null);

// Folder dashboard data: children + stats
const folderDashboard = computed(() => {
  if (!activeFolder.value) return null;
  const prefix = activeFolder.value + "/";
  const children = fileItems.value.filter(f =>
    f.path.startsWith(prefix) && !f.path.slice(prefix.length).includes("/")
  );
  const allDescendants = fileItems.value.filter(f => f.path.startsWith(prefix));
  // Find subfolders directly under this folder
  const subdirs = new Set();
  fileItems.value.forEach(f => {
    if (!f.path.startsWith(prefix)) return;
    const rest = f.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash > 0) subdirs.add(rest.slice(0, slash));
  });
  // Extension breakdown
  const byExt = {};
  allDescendants.forEach(f => {
    const m = f.path.match(/\.([a-z0-9]+)$/i);
    const ext = m ? m[1].toLowerCase() : "—";
    byExt[ext] = (byExt[ext] || 0) + 1;
  });
  return {
    path: activeFolder.value,
    name: activeFolder.value.split("/").pop(),
    fileCount: children.length,
    subdirCount: subdirs.size,
    deepCount: allDescendants.length,
    children, // immediate files
    subdirs: [...subdirs],
    byExt: Object.keys(byExt).sort((a, b) => byExt[b] - byExt[a]).map(k => ({ ext: k, count: byExt[k] })),
  };
});

// Open a folder's dashboard (instead of toggling expansion only)
const openFolder = (path) => {
  activeFolder.value = path;
  // Ensure folder is expanded so the tree shows its children
  if (!expandedDirs.value.has(path)) toggleDir(path);
  // Clear active file selection; folder dashboard takes over the center
  nav.pickSub({ icon: "folder-open", label: path.split("/").pop() || "/", view: "open-pencil", pane: "files", folder: path }, "Files");
};

// Synthetic file content — keyed by path. Real load wired in production via Tauri fs scope.
// Includes a handful of pre-baked snippets so the file viewer reads like a real IDE preview.
const FILE_SAMPLES = {
  "README.md": "# LifeOS — Vue + Tauri kit\n\nSibling implementation of `ui_kits/lifeos_app/` (React canon), rebuilt as production-ready Vue 3 + Vite + Pinia + vue-router + Tauri.\n\n## Two ways to view this\n\n- **In-browser preview** — open `index.html` directly. Uses `vue3-sfc-loader` to compile `.vue` at runtime.\n- **Production build** — `npm install && npm run tauri:dev`.",
  "package.json": "{\n  \"name\": \"lifeos-vue\",\n  \"version\": \"0.1.0\",\n  \"scripts\": {\n    \"dev\":  \"vite\",\n    \"build\":\"vite build\",\n    \"test\": \"vitest\",\n    \"tauri:dev\":   \"tauri dev\",\n    \"tauri:build\": \"tauri build\"\n  }\n}",
  "src/App.vue": "<" + "script setup>\nimport { useLifeos } from \"@/stores/lifeos.js\";\nimport Sidebar       from \"./components/Sidebar.vue\";\nimport Workspace     from \"./components/Workspace.vue\";\nimport Dashboard     from \"./components/Dashboard.vue\";\nimport AIAvatar      from \"./components/AIAvatar.vue\";\nconst lifeos = useLifeos();\n<" + "/script>\n\n<template>\n  <div :class=\"['shell', { 'ws-collapsed': lifeos.wsCollapsed }]\">\n    <Sidebar />\n    <Workspace />\n    <main class=\"main\" id=\"main\" tabindex=\"-1\">\n      <Dashboard />\n    </main>\n    <AIAvatar />\n  </div>\n</template>",
  "src/components/Badge.vue": "<" + "script setup>\ndefineProps({\n  count:   { type: Number, default: null },\n  tone:    { type: String, default: \"ok\" },\n  pulse:   { type: Boolean, default: false },\n  dot:     { type: Boolean, default: false },\n  variant: { type: String, default: \"count\" },\n});\n<" + "/script>\n\n<template>\n  <span v-if=\"dot\" class=\"status-dot\" :class=\"{ pulse }\" aria-hidden=\"true\" />\n  <span v-else-if=\"count != null\" class=\"count\" :class=\"`tone-${tone}`\">\n    {{ count > 99 ? \"99+\" : count }}\n  </span>\n</template>",
  "src/components/MenuRow.vue": "<" + "script setup>\nimport Icon  from \"./Icon.vue\";\nimport Badge from \"./Badge.vue\";\ndefineProps({\n  item:      { type: Object,  required: true },\n  collapsed: { type: Boolean, default: false },\n});\ndefineEmits([\"click\"]);\n<" + "/script>",
  "src/stores/lifeos.js": "import { defineStore } from \"pinia\";\nimport { resolveWorkspace } from \"@/lib/resolve.js\";\n\nexport const useLifeos = defineStore(\"lifeos\", {\n  state: () => ({\n    activeId:    \"ai\",\n    wsCollapsed: false,\n    activeSub:   null,\n    aiMessages:  [{ role: \"ai\", text: \"Hey, Alex. I'm here.\" }],\n  }),\n  getters: {\n    workspace(s) { return resolveWorkspace(s.activeId); },\n  },\n  actions: {\n    pickWorkspace(id) { this.activeId = id; this.activeSub = null; },\n    sendAiMessage(text) { this.aiMessages.push({ role: \"user\", text }); },\n  },\n});",
};

const fileContent = computed(() => {
  const p = activePath.value;
  if (!p) return "";
  if (FILE_SAMPLES[p]) return FILE_SAMPLES[p];
  return `# ${p}\n\n# (Preview) — the actual contents live on disk under ui_kits/lifeos_vue/${p}.\n# In the production Tauri build this view loads the file via @tauri-apps/plugin-fs,\n# inside the allowlist scoped to $APPDATA/lifeos/vault and the project root.\n\n# AI chat (right) has this file in its working context. Use the Preview tab\n# to see the rendered output for HTML / Markdown / Vue / SVG.`;
});

const fileExt = computed(() => {
  const p = activePath.value || "";
  const m = p.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
});

const langLabel = computed(() => ({
  vue: "Vue · SFC",
  ts: "TypeScript",
  js: "JavaScript",
  rs: "Rust",
  toml: "TOML",
  json: "JSON",
  md: "Markdown",
  html: "HTML",
  css: "CSS",
}[fileExt.value] || (fileExt.value ? fileExt.value.toUpperCase() : "File")));

// Rendered preview body — best-effort for the formats we recognize.
const previewHtml = computed(() => {
  if (!activePath.value) return "";
  const ext = fileExt.value;
  if (ext === "md") {
    return fileContent.value
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm,  "<h2>$1</h2>")
      .replace(/^# (.*)$/gm,   "<h1>$1</h1>")
      .replace(/`([^`]+)`/g,   "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/^(.+)$/, "<p>$1</p>");
  }
  if (ext === "json") {
    try { return "<pre>" + JSON.stringify(JSON.parse(fileContent.value), null, 2) + "</pre>"; }
    catch { return "<pre>Invalid JSON</pre>"; }
  }
  if (ext === "vue" || ext === "html") {
    return "<p>Rendered SFC preview lives in OpenPencil canvas. Click <strong>↗ Open in canvas</strong> above to launch.</p>";
  }
  return "<p>No preview available for <code>." + ext + "</code> — switch to the editor tab to view source.</p>";
});

// Open tabs — clicking a file in the tree adds (or focuses) a tab.
const openTabs = ref([]);
watch(activePath, (p) => {
  if (!p) return;
  if (!openTabs.value.find(t => t.path === p)) {
    const f = fileItems.value.find(x => x.path === p);
    openTabs.value.push({ path: p, icon: f?.icon || "file" });
  }
}, { immediate: true });

const closeTab = (path) => {
  const idx = openTabs.value.findIndex(t => t.path === path);
  if (idx < 0) return;
  openTabs.value.splice(idx, 1);
  if (activePath.value === path) {
    const next = openTabs.value[idx] || openTabs.value[idx - 1] || null;
    if (next) openFile(next.path);
    else nav.pickSub({ icon: "folder-tree", label: "Files", view: "open-pencil", pane: "files" }, "Files");
  }
};

// Center pane: split between editor and preview, or stacked tabs.
const filesView = ref("split");   // "editor" | "preview" | "split"

// File-pick handler: routes via the store so router + breadcrumb stay in sync
const openFile = (path) => {
  const fileEntry = fileItems.value.find(f => f.path === path);
  if (!fileEntry) return;
  activeFolder.value = null;
  nav.pickSub(fileEntry, "Files");
};

// Quick file-system operations
const newFile = () => {
  const path = window.prompt("New file path (e.g. src/components/NewThing.vue):");
  if (!path) return;
  lifeos.addItem("ai", "Files", { icon: "file-code", label: path.split("/").pop(), meta: path, path, view: "open-pencil", pane: "files" });
};

// Tool palette (mirrors OpenPencil's tool ribbon order)
const tools = [
  { id: "select",   icon: "mouse-pointer-2", label: "Select", shortcut: "V" },
  { id: "frame",    icon: "frame",            label: "Frame",  shortcut: "F" },
  { id: "rect",     icon: "square",           label: "Rectangle", shortcut: "R" },
  { id: "ellipse",  icon: "circle",           label: "Ellipse",   shortcut: "O" },
  { id: "pen",      icon: "pen-tool",         label: "Pen",       shortcut: "P" },
  { id: "text",     icon: "type",             label: "Text",      shortcut: "T" },
  { id: "image",    icon: "image",            label: "Image",     shortcut: "I" },
  { id: "comment",  icon: "message-circle",   label: "Comment",   shortcut: "C" },
];
const activeTool = ref("select");

// Layers panel (left side of canvas)
const layers = [
  { id: "page",       depth: 0, type: "page",      name: "LifeOS · app",   expanded: true },
  { id: "shell",      depth: 1, type: "frame",     name: "shell",          expanded: true },
  { id: "rail",       depth: 2, type: "frame",     name: "Sidebar / rail", selected: false },
  { id: "workspace",  depth: 2, type: "frame",     name: "Workspace",      selected: false },
  { id: "ws-section", depth: 3, type: "frame",     name: "ws-section",     selected: true  },
  { id: "menu-row",   depth: 4, type: "instance",  name: "MenuRow",        selected: false },
  { id: "main",       depth: 2, type: "frame",     name: "Main canvas",    selected: false },
  { id: "ai-avatar",  depth: 2, type: "instance",  name: "AIAvatar",       selected: false },
];

const TYPE_GLYPH = {
  page: "file-text", frame: "frame", instance: "component", text: "type", image: "image"
};

// Inspector — depends on the currently selected layer
const inspector = ref({
  name: "ws-section",
  fill:   "var(--bg-2)",
  stroke: "var(--lifeos-cyan)",
  width: 268, height: 84, x: 12, y: 124,
  cornerRadius: 10,
  autoLayout: "vertical", padding: 14, gap: 6,
});

// Shared AI chat — same conversation as the floating AIChat panel.
const aiDraft = ref("");
const sendAi = () => {
  const text = aiDraft.value.trim();
  if (!text) return;
  lifeos.sendAiMessage(text, { source: "open-pencil" });
  aiDraft.value = "";
};

// Pane content map for the right rail
const paneTitle = computed(() => ({
  canvas: "Canvas",
  components: "Components",
  "ai-chat": "AI chat",
  mcp: "MCP server",
  agent: "Coding agent",
  tokens: "Tokens & variables",
  lint: "Lint",
  export: "Export",
  files: activePath.value || "Files",
}[pane.value] || "Canvas"));
</script>

<template>
  <div class="canvas op-canvas">
    <header class="op-head">
      <button class="sub-back" @click="lifeos.clearSub" aria-label="Back to dashboard">
        <Icon name="arrow-left" :size="14" /> Dashboard
      </button>
      <div class="sub-breadcrumb">
        <span>AI Command Center</span>
        <Icon name="chevron-right" :size="12" />
        <span>UI-Editor</span>
        <Icon name="chevron-right" :size="12" />
        <strong>{{ item.label }}</strong>
      </div>
      <a class="op-source" href="https://github.com/FlexNetOS/open-pencil/tree/develop"
         target="_blank" rel="noopener noreferrer"
         title="Source: FlexNetOS/open-pencil (develop)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
          <path d="M9 18c-4.51 2-5-2-7-2"/>
        </svg>
        open-pencil · develop
      </a>
    </header>

    <section class="op-shell">
      <!-- LEFT · Layers + tools -->
      <aside class="op-left">
        <div class="op-tools" role="toolbar" aria-label="Drawing tools">
          <button v-for="t in tools" :key="t.id"
                  :class="['op-tool', { active: activeTool === t.id }]"
                  :title="`${t.label} · ${t.shortcut}`"
                  :aria-label="t.label"
                  @click="activeTool = t.id">
            <Icon :name="t.icon" :size="14" />
          </button>
        </div>
        <div class="op-layers" aria-label="Layers">
          <div class="op-pane-head">
            <span>Layers</span>
            <span class="op-count">{{ layers.length }}</span>
          </div>
          <button v-for="layer in layers" :key="layer.id"
                  :class="['op-layer', { selected: layer.selected }]"
                  :style="{ paddingLeft: (10 + layer.depth * 12) + 'px' }"
                  :aria-selected="layer.selected">
            <Icon :name="TYPE_GLYPH[layer.type] || 'square'" :size="11" />
            <span class="op-layer-name">{{ layer.name }}</span>
            <Icon v-if="layer.type === 'instance'" name="link" :size="9" class="op-layer-instance" />
          </button>
        </div>
      </aside>

      <!-- CENTER · Canvas -->
      <main class="op-canvas-wrap">
        <div class="op-canvas-head">
          <span class="op-canvas-name">{{ paneTitle }}</span>
          <div class="op-canvas-actions">
            <button class="op-mini-btn" title="Zoom out"><Icon name="zoom-out" :size="12" /></button>
            <span class="op-zoom">100%</span>
            <button class="op-mini-btn" title="Zoom in"><Icon name="zoom-in" :size="12" /></button>
            <button class="op-mini-btn" title="Toggle grid"><Icon name="grid-3x3" :size="12" /></button>
          </div>
        </div>
        <div class="op-canvas-stage" :data-pane="pane">
          <!-- CANVAS PANE -->
          <template v-if="pane === 'canvas'">
            <div class="op-frame">
              <div class="op-frame-label"><Icon name="frame" :size="10" /> shell · 1380×800</div>
              <div class="op-frame-body">
                <div class="op-frame-rail">rail</div>
                <div class="op-frame-ws">
                  <div class="op-frame-ws-head">Workspace · header</div>
                  <div class="op-frame-ws-section selected">ws-section · selected</div>
                  <div class="op-frame-ws-section">ws-section</div>
                </div>
                <div class="op-frame-main">Main canvas</div>
              </div>
            </div>
          </template>

          <!-- COMPONENTS PANE -->
          <template v-else-if="pane === 'components'">
            <div class="op-grid">
              <div v-for="c in ['MenuRow','Badge','Icon','AIAvatar','AIChat','SectionHeader','StatCard','TeamCard']" :key="c" class="op-comp-card">
                <Icon name="component" :size="14" /> {{ c }}
              </div>
            </div>
          </template>

          <!-- AI CHAT PANE -->
          <template v-else-if="pane === 'ai-chat'">
            <div class="op-ai-chat">
              <div class="op-ai-head">
                <span class="op-ai-head-meta">
                  <span class="op-dot online" />
                  Shared with the floating AI panel · {{ lifeos.aiMessages.length }} messages
                </span>
                <button type="button" class="op-mini-btn" title="Clear conversation" @click="lifeos.clearAiMessages()">
                  <Icon name="rotate-ccw" :size="11" />
                </button>
              </div>
              <div class="op-ai-log">
                <div v-for="(m, i) in lifeos.aiMessages" :key="i" :class="['op-ai-msg', m.role]">
                  <span>{{ m.text }}</span>
                </div>
              </div>
              <form class="op-ai-input" @submit.prevent="sendAi">
                <input v-model="aiDraft"
                       placeholder="Tell the agent to refactor, extract, restyle…"
                       aria-label="Message the AI"
                       autocomplete="off" />
                <button type="submit" :disabled="!aiDraft.trim()" aria-label="Send">
                  <Icon name="send" :size="12" />
                </button>
              </form>
            </div>
          </template>

          <!-- MCP PANE -->
          <template v-else-if="pane === 'mcp'">
            <pre class="op-code">openpencil-mcp                         # stdio (Claude Code / Cursor / Windsurf)
openpencil-mcp-http                    # http://localhost:3100/mcp
claude mcp add --scope user open-pencil -- openpencil-mcp

# Tools available: 100+
#   • shapes · text · components · variants · layout · variables
#   • tokens · linter · export · figma-compat · screenshot · query (xpath)</pre>
            <div class="op-status-row">
              <span class="op-dot online" /> stdio listening
              <span class="op-dot online" /> http://localhost:3100
              <span class="op-dot warn" /> require API key for chat
            </div>
          </template>

          <!-- AGENT PANE -->
          <template v-else-if="pane === 'agent'">
            <div class="op-grid">
              <div class="op-comp-card"><Icon name="bot" :size="14" /> Claude Code</div>
              <div class="op-comp-card"><Icon name="bot" :size="14" /> Codex</div>
              <div class="op-comp-card"><Icon name="bot" :size="14" /> Gemini CLI</div>
              <div class="op-comp-card"><Icon name="plus" :size="14" /> Add provider</div>
            </div>
            <p class="op-hint">ACP adapter required for Claude Code. The agent connects to the editor's MCP server and uses all 100+ design tools.</p>
          </template>

          <!-- TOKENS PANE -->
          <template v-else-if="pane === 'tokens'">
            <div class="op-tokens">
              <div v-for="t in [
                { name: '--lifeos-cyan',   hex: '#00D4FF', uses: 142 },
                { name: '--lifeos-purple', hex: '#9B7BFF', uses: 76  },
                { name: '--lifeos-green',  hex: '#00E676', uses: 51  },
                { name: '--bg-0',          hex: '#0A0A0A', uses: 312 },
                { name: '--bg-2',          hex: '#1A1A1A', uses: 188 },
                { name: '--fg-1',          hex: '#ECEDEE', uses: 244 },
              ]" :key="t.name" class="op-token">
                <span class="op-token-swatch" :style="{ background: t.hex }" />
                <span class="op-token-name">{{ t.name }}</span>
                <span class="op-token-hex">{{ t.hex }}</span>
                <span class="op-token-uses">{{ t.uses }}×</span>
              </div>
            </div>
          </template>

          <!-- LINT PANE -->
          <template v-else-if="pane === 'lint'">
            <ul class="op-lint">
              <li class="warn"><Icon name="alert-triangle" :size="12" /> <code>SectionHeader</code> · low color contrast on <code>--fg-3</code> over <code>--bg-1</code> (3.8:1)</li>
              <li class="warn"><Icon name="alert-triangle" :size="12" /> <code>MenuRow</code> · hit-target is 36×36 (target ≥ 44 on touch)</li>
              <li class="info"><Icon name="info"  :size="12" /> Use semantic token <code>--surface-card</code> instead of literal <code>#1A1A1A</code> in <code>Workspace.vue</code></li>
              <li class="ok"  ><Icon name="check" :size="12" /> All buttons have <code>aria-label</code></li>
            </ul>
          </template>

          <!-- EXPORT PANE -->
          <template v-else-if="pane === 'export'">
            <div class="op-grid">
              <button v-for="e in ['PNG @1x','PNG @2x','PNG @3x','SVG','JPG q90','WEBP','.fig (file)','JSX · Tailwind']" :key="e" class="op-comp-card">
                <Icon name="download" :size="14" /> {{ e }}
              </button>
            </div>
          </template>

          <!-- FILES PANE — IDE-style file + folder dashboard.
               Architecture mirrors iOfficeAI/AionUi (Explorer + Tabs + Editor + Preview + AI). -->
          <template v-else-if="pane === 'files'">
            <div class="op-files">
              <!-- LEFT · Explorer -->
              <aside class="op-files-tree" aria-label="File tree">
                <div class="op-pane-head explorer">
                  <span class="op-pane-head-label">
                    <Icon name="folder-tree" :size="11" /> Explorer
                  </span>
                  <span class="op-pane-head-actions">
                    <button class="op-mini-btn" title="New file" @click="newFile">
                      <Icon name="file-plus" :size="11" />
                    </button>
                    <button class="op-mini-btn" title="Refresh">
                      <Icon name="refresh-cw" :size="11" />
                    </button>
                    <span class="op-count">{{ fileItems.length }}</span>
                  </span>
                </div>
                <div class="op-files-search">
                  <Icon name="search" :size="11" />
                  <input placeholder="Search files…" aria-label="Search files" />
                </div>
                <div class="op-files-tree-body">
                  <template v-for="row in flatTree" :key="(row.kind === 'dir' ? 'd:' : 'f:') + row.path">
                    <div v-if="row.kind === 'dir'" class="op-tree-row-wrap">
                      <button class="op-tree-row dir"
                              :class="{ active: activeFolder === row.path }"
                              :style="{ paddingLeft: (8 + (row.level - 1) * 12) + 'px' }"
                              :title="row.path"
                              @click="openFolder(row.path)">
                        <Icon :name="expandedDirs.has(row.path) ? 'folder-open' : 'folder'" :size="12" />
                        <span class="op-tree-name">{{ row.name }}</span>
                        <span class="op-tree-count">{{ row.count }}</span>
                      </button>
                      <button class="op-tree-chev"
                              :aria-expanded="expandedDirs.has(row.path)"
                              :title="expandedDirs.has(row.path) ? 'Collapse' : 'Expand'"
                              @click.stop="toggleDir(row.path)">
                        <Icon :name="expandedDirs.has(row.path) ? 'chevron-down' : 'chevron-right'" :size="10" />
                      </button>
                    </div>
                    <button v-else
                            class="op-tree-row file"
                            :class="{ active: activePath === row.path }"
                            :style="{ paddingLeft: (24 + (row.level - 1) * 12) + 'px' }"
                            :title="row.path"
                            :aria-current="activePath === row.path ? 'page' : undefined"
                            @click="openFile(row.path)">
                      <Icon :name="row.icon || 'file'" :size="12" />
                      <span class="op-tree-name">{{ row.name }}</span>
                    </button>
                  </template>
                </div>
              </aside>

              <!-- CENTER · Tabs · Path · Editor + Preview -->
              <section class="op-files-main">
                <!-- Open-tabs strip -->
                <div class="op-files-tabs" role="tablist" aria-label="Open files">
                  <button v-for="t in openTabs" :key="t.path"
                          :class="['op-files-tab', { active: activePath === t.path }]"
                          role="tab"
                          :aria-selected="activePath === t.path"
                          @click="openFile(t.path)"
                          :title="t.path">
                    <Icon :name="t.icon" :size="11" />
                    <span class="op-files-tab-name">{{ t.path.split("/").pop() }}</span>
                    <span class="op-files-tab-x" @click.stop="closeTab(t.path)" aria-label="Close tab">
                      <Icon name="x" :size="9" />
                    </span>
                  </button>
                  <span v-if="!openTabs.length" class="op-files-tab-empty">no files open</span>
                </div>

                <!-- Folder dashboard: shown when activeFolder is set and no file is active -->
                <div v-if="folderDashboard && !activePath" class="op-folder-dash">
                  <header class="op-folder-head">
                    <Icon name="folder-open" :size="22" class="op-folder-glyph" />
                    <div class="op-folder-id">
                      <div class="op-folder-path">{{ folderDashboard.path }}</div>
                      <div class="op-folder-name">{{ folderDashboard.name }}</div>
                    </div>
                    <button class="op-mini-btn" title="New file in this folder"
                            @click="newFile">
                      <Icon name="file-plus" :size="12" />
                    </button>
                  </header>

                  <div class="op-folder-stats">
                    <div class="op-folder-stat">
                      <div class="op-folder-stat-num">{{ folderDashboard.fileCount }}</div>
                      <div class="op-folder-stat-lbl">files here</div>
                    </div>
                    <div class="op-folder-stat">
                      <div class="op-folder-stat-num">{{ folderDashboard.subdirCount }}</div>
                      <div class="op-folder-stat-lbl">subfolders</div>
                    </div>
                    <div class="op-folder-stat">
                      <div class="op-folder-stat-num">{{ folderDashboard.deepCount }}</div>
                      <div class="op-folder-stat-lbl">total descendants</div>
                    </div>
                    <div class="op-folder-stat" v-for="e in folderDashboard.byExt.slice(0, 4)" :key="e.ext">
                      <div class="op-folder-stat-num">{{ e.count }}</div>
                      <div class="op-folder-stat-lbl">.{{ e.ext }}</div>
                    </div>
                  </div>

                  <section class="op-folder-section" v-if="folderDashboard.subdirs.length">
                    <h4>Subfolders</h4>
                    <div class="op-folder-grid">
                      <button v-for="s in folderDashboard.subdirs" :key="s"
                              class="op-folder-card folder"
                              @click="openFolder(folderDashboard.path + '/' + s)">
                        <Icon name="folder" :size="16" />
                        <span class="op-folder-card-name">{{ s }}</span>
                        <Icon name="chevron-right" :size="11" />
                      </button>
                    </div>
                  </section>

                  <section class="op-folder-section">
                    <h4>Files</h4>
                    <div class="op-folder-grid">
                      <button v-for="f in folderDashboard.children" :key="f.path"
                              class="op-folder-card"
                              @click="openFile(f.path)">
                        <Icon :name="f.icon || 'file'" :size="16" />
                        <div class="op-folder-card-body">
                          <span class="op-folder-card-name">{{ f.path.split("/").pop() }}</span>
                          <span class="op-folder-card-meta" v-if="f.meta">{{ f.meta }}</span>
                        </div>
                        <Icon name="chevron-right" :size="11" />
                      </button>
                    </div>
                  </section>
                </div>

                <!-- File editor + preview: shown when a file is active -->
                <header v-else-if="activePath" class="op-files-head">
                  <Icon name="file-code" :size="13" />
                  <span class="op-files-path">
                    <template v-for="(seg, i) in activePath.split('/')" :key="i">
                      <span v-if="i > 0" class="op-files-path-sep">/</span>
                      <span :class="{ 'op-files-path-leaf': i === activePath.split('/').length - 1 }">{{ seg }}</span>
                    </template>
                  </span>
                  <span class="op-files-lang">{{ langLabel }}</span>
                  <div class="op-files-view-switch" role="tablist" aria-label="View">
                    <button :class="{ active: filesView === 'editor'  }" @click="filesView = 'editor'"  title="Editor only">
                      <Icon name="code" :size="11" /> Editor
                    </button>
                    <button :class="{ active: filesView === 'split'   }" @click="filesView = 'split'"   title="Editor + Preview">
                      <Icon name="columns-2" :size="11" /> Split
                    </button>
                    <button :class="{ active: filesView === 'preview' }" @click="filesView = 'preview'" title="Preview only">
                      <Icon name="eye" :size="11" /> Preview
                    </button>
                  </div>
                  <button class="op-mini-btn" title="Open in OpenPencil canvas"
                          @click="nav.pickSub({ icon: 'pen-tool', label: 'OpenPencil canvas', view: 'open-pencil', pane: 'canvas' }, 'UI-Editor')">
                    <Icon name="external-link" :size="12" />
                  </button>
                </header>

                <div v-if="activePath" class="op-files-body" :data-view="filesView">
                  <div v-if="filesView !== 'preview'" class="op-files-editor" aria-label="File editor">
                    <ol class="op-files-gutter">
                      <li v-for="(_, i) in fileContent.split('\n')" :key="i">{{ i + 1 }}</li>
                    </ol>
                    <pre class="op-files-code">{{ fileContent }}</pre>
                  </div>
                  <div v-if="filesView !== 'editor'" class="op-files-preview" aria-label="File preview">
                    <div class="op-files-preview-head">
                      <Icon name="eye" :size="11" />
                      <span>Preview</span>
                      <span class="op-files-preview-ext">.{{ fileExt }}</span>
                    </div>
                    <div class="op-files-preview-body" v-html="previewHtml" />
                  </div>
                </div>
                <div v-else-if="!folderDashboard" class="op-files-empty">
                  <Icon name="folder-tree" :size="22" />
                  <p>Pick a file or folder in the tree to load its dashboard.</p>
                </div>
              </section>

              <!-- RIGHT · AI chat removed; the floating avatar opens the chat instead. -->
            </div>
          </template>
        </div>
      </main>

      <!-- RIGHT · Inspector -->
      <aside class="op-right">
        <div class="op-pane-head">
          <span>Inspector</span>
          <button class="op-mini-btn" title="Properties"><Icon name="sliders-horizontal" :size="12" /></button>
        </div>
        <div class="op-insp">
          <div class="op-insp-section">
            <div class="op-insp-label">Selection</div>
            <input class="op-insp-name" v-model="inspector.name" />
          </div>
          <div class="op-insp-section">
            <div class="op-insp-label">Position & size</div>
            <div class="op-insp-grid">
              <span>X</span><input :value="inspector.x" />
              <span>Y</span><input :value="inspector.y" />
              <span>W</span><input :value="inspector.width" />
              <span>H</span><input :value="inspector.height" />
            </div>
          </div>
          <div class="op-insp-section">
            <div class="op-insp-label">Auto layout</div>
            <div class="op-insp-grid">
              <span>Dir</span><input :value="inspector.autoLayout" />
              <span>Gap</span><input :value="inspector.gap" />
              <span>Pad</span><input :value="inspector.padding" />
              <span>Rad</span><input :value="inspector.cornerRadius" />
            </div>
          </div>
          <div class="op-insp-section">
            <div class="op-insp-label">Fill</div>
            <div class="op-insp-color"><span class="op-swatch" :style="{ background: inspector.fill }" /><input :value="inspector.fill" /></div>
            <div class="op-insp-label">Stroke</div>
            <div class="op-insp-color"><span class="op-swatch" :style="{ background: inspector.stroke }" /><input :value="inspector.stroke" /></div>
          </div>
        </div>
      </aside>
    </section>
  </div>
</template>
