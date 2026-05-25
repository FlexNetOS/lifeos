<script setup>
// LifeOS — CalendarView SFC
// 7-day agenda strip filtered by workspace context (Work → Work tag; Personal → Personal + Family tags).
// Static-first: no interactions beyond hover. Dark surface, tokens-only, one accent per row.

import { computed } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useNav } from "@/lib/nav.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();
const nav = useNav();

const sub = computed(() => lifeos.activeSub);

// Determine which tags to show based on the workspace that owns this activeSub.
const workspaceId = computed(() => sub.value?.workspaceId || "");
const WORK_TAGS    = new Set(["Work"]);
const PERSONAL_TAGS = new Set(["Personal", "Family"]);

const tagFilter = computed(() => {
  if (workspaceId.value === "work")     return WORK_TAGS;
  if (workspaceId.value === "personal") return PERSONAL_TAGS;
  return null; // null = show all
});

// Pull agenda from global data.
const agenda = computed(() => {
  const raw = (window).LIFEOS_DATA?.dashboardCanvas?.agenda || [];
  const f = tagFilter.value;
  return f ? raw.filter(ev => f.has(ev.tag)) : raw;
});

// Group by day, preserving insertion order (Today, Tomorrow, Wed, …).
const DAY_ORDER = ["Today", "Tomorrow", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const byDay = computed(() => {
  const map = new Map();
  for (const ev of agenda.value) {
    const d = ev.day || "Today";
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(ev);
  }
  // Sort keys by DAY_ORDER; unknown days land at the end.
  return [...map.entries()].sort(([a], [b]) => {
    const ai = DAY_ORDER.indexOf(a);
    const bi = DAY_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
});

const toneVar = (tone) => {
  const map = {
    cyan:   "var(--lifeos-cyan, #00d4ff)",
    purple: "var(--lifeos-purple, #9b7bff)",
    green:  "var(--lifeos-green, #00e676)",
    warn:   "var(--status-warn, #ffb020)",
    err:    "var(--status-err, #ff4d6a)",
    info:   "var(--lifeos-cyan, #00d4ff)",
  };
  return map[tone] || "var(--fg-2, #a0a0b0)";
};

const backToDashboard = () => nav.clearSub();
</script>

<template>
  <div class="canvas cal-canvas" role="region" aria-label="Calendar">
    <header class="lights-head">
      <div>
        <div class="canvas-eyebrow">
          {{ workspaceId === "work" ? "Work" : "Personal" }} · Calendar
        </div>
        <h1>Calendar</h1>
        <p class="lights-summary">{{ agenda.length }} events · next 7 days</p>
      </div>
      <button class="lights-back" type="button" @click="backToDashboard" aria-label="Back to dashboard">
        <Icon name="arrow-left" :size="14" /> Dashboard
      </button>
    </header>

    <div v-if="agenda.length === 0" class="sub-empty">
      <Icon name="calendar" :size="20" />
      <p>No events in the next 7 days. Ask LifeOS to pull your calendar.</p>
    </div>

    <div v-else class="cal-strip">
      <section
        v-for="([day, events]) in byDay"
        :key="day"
        class="cal-day"
        :class="{ 'cal-day--today': day === 'Today' }"
      >
        <div class="cal-day-label">{{ day }}</div>
        <ul class="cal-event-list">
          <li
            v-for="(ev, i) in events"
            :key="i"
            class="cal-event-row"
            :style="{ '--row-accent': toneVar(ev.tone) }"
          >
            <span class="cal-event-accent" aria-hidden="true" />
            <span class="cal-event-icon" aria-hidden="true">
              <Icon
                :name="ev.tag === 'Work' ? 'video' : ev.tag === 'Family' ? 'heart' : ev.tag === 'Home' ? 'home' : 'calendar'"
                :size="13"
              />
            </span>
            <span class="cal-event-time">{{ ev.time }}</span>
            <span class="cal-event-title">{{ ev.title }}</span>
            <span class="cal-event-tag">{{ ev.tag }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cal-canvas {
  display: flex;
  flex-direction: column;
  gap: var(--space-5, 20px);
  padding: var(--space-6, 24px);
  min-height: 100%;
}

/* Reuse lights-head / lights-back / lights-summary / canvas-eyebrow / sub-empty from global styles */

.cal-strip {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.cal-day {
  background: var(--bg-2, #1a1a2e);
  border: 1px solid var(--bg-4, #2a2a40);
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
}

.cal-day--today {
  border-color: var(--lifeos-cyan, #00d4ff);
  border-opacity: 0.4;
}

.cal-day-label {
  font-size: var(--text-xs, 11px);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-2, #a0a0b0);
  padding: var(--space-3, 10px) var(--space-4, 16px) var(--space-2, 8px);
  border-bottom: 1px solid var(--bg-3, #222238);
}

.cal-day--today .cal-day-label {
  color: var(--lifeos-cyan, #00d4ff);
}

.cal-event-list {
  list-style: none;
  margin: 0;
  padding: var(--space-2, 8px) 0;
}

.cal-event-row {
  display: flex;
  align-items: center;
  gap: var(--space-3, 10px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  transition: background 120ms ease;
  cursor: default;
}

.cal-event-row:hover {
  background: var(--bg-3, #222238);
}

.cal-event-accent {
  width: 3px;
  height: 20px;
  border-radius: 2px;
  background: var(--row-accent);
  flex-shrink: 0;
}

.cal-event-icon {
  color: var(--row-accent);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.cal-event-time {
  font-size: var(--text-xs, 11px);
  color: var(--fg-2, #a0a0b0);
  width: 5.5rem;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.cal-event-title {
  font-size: var(--text-sm, 13px);
  color: var(--fg-1, #e0e0f0);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cal-event-tag {
  font-size: var(--text-xs, 11px);
  color: var(--row-accent);
  opacity: 0.75;
  flex-shrink: 0;
}
</style>
