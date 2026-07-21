<script setup>
// LifeOS — CommandPalette SFC (Phase 4 #2)
// Cmd-K / Ctrl-K opens a fuzzy-search across all workspaces, sections, items, and teams.
// Selection routes via useNav so the URL stays in sync (Phase 4 #1 contract).
// Ported from design-system-reference/lifeos_app_react/CommandPalette.jsx.

import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useNav } from "@/lib/nav.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();
const nav = useNav();

const q = ref("");
const active = ref(0);
const inputRef = ref(null);
const listRef = ref(null);

// Lightweight scoring: exact > prefix > substring > char-sequence. No external lib.
function scoreMatch(query, target) {
  if (!query) return 0;
  const qq = query.toLowerCase();
  const tt = String(target || "").toLowerCase();
  if (!tt) return 0;
  if (tt === qq) return 1000;
  if (tt.startsWith(qq)) return 500 + (qq.length / tt.length) * 100;
  const idx = tt.indexOf(qq);
  if (idx >= 0) return 250 - idx;
  let ti = 0, hits = 0, lastIdx = -1, runs = 0;
  for (let qi = 0; qi < qq.length; qi++) {
    const ch = qq[qi];
    let found = -1;
    for (let i = ti; i < tt.length; i++) {
      if (tt[i] === ch) { found = i; break; }
    }
    if (found < 0) return 0;
    if (found === lastIdx + 1) runs++;
    lastIdx = found;
    ti = found + 1;
    hits++;
  }
  return hits === qq.length ? 50 + runs * 5 : 0;
}

function indexAll() {
  const D = (window).LIFEOS_DATA;
  if (!D) return [];
  const out = [];
  (D.rail || []).concat(D.railFooter || []).forEach((r) => {
    const ws = r.id === "settings" ? D.profile : D.workspaces?.[r.id];
    if (!ws) {
      out.push({ kind: "workspace", id: r.id, icon: r.icon, label: r.tooltip?.split(" (")[0] || r.id, hint: r.tooltip || "", route: { workspaceId: r.id } });
      return;
    }
    out.push({ kind: "workspace", id: r.id, icon: r.icon, label: ws.title, hint: r.tooltip || "", route: { workspaceId: r.id } });
    (ws.sections || []).forEach((s) => {
      out.push({ kind: "section", id: `${r.id}/${s.title}`, icon: s.items?.[0]?.icon || "list", label: s.title, hint: ws.title, route: { workspaceId: r.id, sectionTitle: s.title } });
      (s.items || []).forEach((item) => {
        out.push({
          kind: "item",
          id: `${r.id}/${s.title}/${item.label}`,
          icon: item.icon || "circle",
          label: item.label,
          hint: `${ws.title} · ${s.title}${item.meta ? " · " + item.meta : ""}`,
          route: { workspaceId: r.id, sectionTitle: s.title, item },
        });
      });
    });
  });
  (D.dashboardCanvas?.teams || []).forEach((t) => {
    out.push({ kind: "team", id: `team/${t.id}`, icon: t.icon, label: t.name, hint: `Agent team · ${t.meta || ""}`, route: { team: t } });
  });
  return out;
}

const KIND_LABEL = { workspace: "Workspace", section: "Section", item: "Item", team: "Team" };
const KIND_TONE  = { workspace: "cyan",      section: "purple",  item: "neutral", team: "green" };

const corpus = ref([]);
const results = computed(() => {
  if (!q.value.trim()) {
    const wsItems = corpus.value.filter(r => r.kind === "workspace").slice(0, 8);
    const teams = corpus.value.filter(r => r.kind === "team");
    return [...wsItems, ...teams];
  }
  const scored = corpus.value.map((r) => {
    const s = Math.max(
      scoreMatch(q.value, r.label) * 1.2,
      scoreMatch(q.value, r.hint || "") * 0.6,
    );
    return { r, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 60);
  return scored.map((x) => x.r);
});

const pick = (r) => {
  lifeos.closeCmdk();
  if (r.kind === "team") {
    nav.jumpToTeam(r.route.team, 0);
    return;
  }
  const { workspaceId, sectionTitle, item } = r.route;
  if (sectionTitle && item) {
    nav.pickWorkspace(workspaceId);
    nav.pickSection(sectionTitle);
    nav.pickSub(item, sectionTitle);
  } else if (sectionTitle) {
    nav.pickWorkspace(workspaceId);
    nav.pickSection(sectionTitle);
  } else {
    nav.pickWorkspace(workspaceId);
  }
};

const onKey = (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    active.value = Math.min(active.value + 1, results.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    active.value = Math.max(active.value - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (results.value[active.value]) pick(results.value[active.value]);
  } else if (e.key === "Escape") {
    e.preventDefault();
    lifeos.closeCmdk();
  }
};

watch(() => lifeos.cmdkOpen, async (open) => {
  if (open) {
    corpus.value = indexAll();
    q.value = lifeos.cmdkSeed || "";
    active.value = 0;
    await nextTick();
    inputRef.current = inputRef.value;
    inputRef.value?.focus();
  }
});

watch(q, () => { active.value = 0; });

watch(active, async () => {
  await nextTick();
  if (!listRef.value) return;
  const el = listRef.value.querySelector(`[data-row-idx="${active.value}"]`);
  if (el?.scrollIntoView) el.scrollIntoView({ block: "nearest" });
});

// Global ⌘K / Ctrl-K shortcut
const onGlobalKey = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    lifeos.toggleCmdk();
  }
};
onMounted(() => document.addEventListener("keydown", onGlobalKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onGlobalKey));

const onOverlayMousedown = (e) => {
  if (e.target === e.currentTarget) lifeos.closeCmdk();
};
</script>

<template>
  <Teleport to="body">
    <div v-if="lifeos.cmdkOpen"
         class="cmdk-overlay"
         role="dialog"
         aria-modal="true"
         aria-label="Command palette"
         @mousedown="onOverlayMousedown">
      <div class="cmdk-panel" data-figma-reference="5:49#command-menu">
        <div class="cmdk-input-wrap">
          <Icon name="search" :size="16" />
          <input ref="inputRef"
                 v-model="q"
                 type="text"
                 placeholder="Jump to workspace · section · item · team…"
                 role="combobox"
                 aria-label="Search LifeOS"
                 aria-autocomplete="list"
                 aria-expanded="true"
                 aria-controls="cmdk-results"
                 :aria-activedescendant="results.length ? `cmdk-row-${active}` : undefined"
                 @keydown="onKey" />
          <kbd class="kbd">ESC</kbd>
        </div>
        <div ref="listRef" id="cmdk-results" class="cmdk-results" role="listbox" aria-label="Command results">
          <div v-if="results.length === 0" class="cmdk-empty" role="option" aria-disabled="true">
            <Icon name="sparkles" :size="14" /> No matches. Try a workspace, section, or team name.
          </div>
          <button v-for="(r, i) in results"
                  :key="r.id"
                  :id="`cmdk-row-${i}`"
                  :data-row-idx="i"
                  :class="['cmdk-row', { active: i === active }]"
                  role="option"
                  :aria-selected="i === active"
                  @mouseenter="active = i"
                  @click="pick(r)">
            <span :class="['cmdk-ico', `tone-${KIND_TONE[r.kind] || 'neutral'}`]">
              <Icon :name="r.icon || 'circle'" :size="14" />
            </span>
            <span class="cmdk-body">
              <span class="cmdk-label">{{ r.label }}</span>
              <span v-if="r.hint" class="cmdk-hint">{{ r.hint }}</span>
            </span>
            <span class="cmdk-kind">{{ KIND_LABEL[r.kind] }}</span>
          </button>
        </div>
        <div class="cmdk-footer">
          <span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> navigate</span>
          <span><kbd class="kbd">↵</kbd> open</span>
          <span><kbd class="kbd">ESC</kbd> close</span>
          <span class="cmdk-count">{{ results.length }} results</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
