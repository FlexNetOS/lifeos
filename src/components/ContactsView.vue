<script setup>
// LifeOS — ContactsView SFC
// Work → Contacts AND Personal → Contacts subsection, plus the rail-footer
// aggregator entry (activeId === "contacts" && !activeSub).
// Canvas pattern: 1fr 320px on desktop, 1fr below 960 px.
// Static-first, token-only, no new deps.

import { ref, computed, reactive } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useNav } from "@/lib/nav.js";
import { useToasts } from "@/stores/toasts.js";
import Icon from "./Icon.vue";

const lifeos  = useLifeos();
const nav     = useNav();
const toasts  = useToasts();

// ---------- Data ----------
const raw = computed(() => (window).LIFEOS_DATA?.contacts || { work: [], personal: [] });

// Determine context: aggregator (contacts rail-footer) vs workspace sub.
// When activeId === "contacts" there is no activeSub; show both workspaces merged.
const isAggregator = computed(() => lifeos.activeId === "contacts");

// Build the displayed list before filter.
// Each contact gets an optional _workspace badge for aggregator context.
const allContacts = computed(() => {
  if (isAggregator.value) {
    return [
      ...raw.value.work.map((c) => ({ ...c, _workspace: "Work" })),
      ...raw.value.personal.map((c) => ({ ...c, _workspace: "Personal" })),
    ];
  }
  // Workspace sub: pick by activeId
  if (lifeos.activeId === "work") return raw.value.work.map((c) => ({ ...c }));
  if (lifeos.activeId === "personal") return raw.value.personal.map((c) => ({ ...c }));
  // Fallback: show everything
  return [
    ...raw.value.work.map((c) => ({ ...c, _workspace: "Work" })),
    ...raw.value.personal.map((c) => ({ ...c, _workspace: "Personal" })),
  ];
});

// ---------- Local star overrides ----------
// Keyed by contact id. undefined = use original value from data.
const starOverrides = reactive({});

const isStarred = (c) =>
  starOverrides[c.id] !== undefined ? starOverrides[c.id] : c.starred;

const toggleStar = (c) => {
  starOverrides[c.id] = !isStarred(c);
};

// ---------- Filter ----------
// Chips: All | Starred | Recent | (Work | Personal — aggregator only)
const activeFilter = ref("all");

const filterChips = computed(() => {
  const base = ["all", "starred", "recent"];
  if (isAggregator.value) return [...base, "work", "personal"];
  return base;
});

const filteredContacts = computed(() => {
  const list = allContacts.value;
  const f = activeFilter.value;
  if (f === "starred")  return list.filter((c) => isStarred(c));
  if (f === "recent")   return list.filter((c) => isRecent(c.lastSeen));
  if (f === "work")     return list.filter((c) => c._workspace === "Work");
  if (f === "personal") return list.filter((c) => c._workspace === "Personal");
  return list;
});

// "recent" = seen within the last day (heuristic on the lastSeen string)
const isRecent = (lastSeen) => {
  if (!lastSeen) return false;
  return /ago|just now/.test(lastSeen) && !(/w ago|mo ago|d ago/.test(lastSeen));
};

// ---------- Stats ----------
const count   = computed(() => allContacts.value.length);
const starred = computed(() => allContacts.value.filter((c) => isStarred(c)).length);

// ---------- Frequent card (right rail) ----------
// Top 5: starred first, then by lastSeen recency proxy (sort order in array).
const frequentContacts = computed(() => {
  const list = [...allContacts.value];
  list.sort((a, b) => {
    const aS = isStarred(a) ? 0 : 1;
    const bS = isStarred(b) ? 0 : 1;
    return aS - bS;
  });
  return list.slice(0, 5);
});

// ---------- Avatar ----------
const TONE = (window).TONE || {};
const toneStyle = (tone) => {
  const t = TONE[tone] || {};
  return {
    background: t.bg || "var(--bg-3)",
    color: t.fg || "var(--fg-1)",
  };
};

const initials = (name) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();

// ---------- Navigation ----------
const backToDashboard = () => nav.clearSub();

// ---------- Row click ----------
const openContact = (c) => {
  toasts.info(`Opening conversation with ${c.name} — coming soon`);
};

// ---------- Quick actions ----------
const newContact = () => {
  toasts.info("New contact — coming soon");
};
const importCsv = () => {
  toasts.info("Import CSV — coming soon");
};
const syncFrom = () => {
  toasts.info("Sync from external source — coming soon");
};

// ---------- Label helpers ----------
const chipLabel = (f) => {
  if (f === "all")      return "All";
  if (f === "starred")  return "Starred";
  if (f === "recent")   return "Recent";
  if (f === "work")     return "Work";
  if (f === "personal") return "Personal";
  return f;
};

const eyebrow = computed(() => {
  if (isAggregator.value) return "All workspaces · Contacts";
  if (lifeos.activeId === "work") return "Work · Contacts";
  if (lifeos.activeId === "personal") return "Personal · Contacts";
  return "Contacts";
});
</script>

<template>
  <div class="canvas contacts-canvas" role="region" aria-label="Contacts">

    <header class="lights-head">
      <div>
        <div class="canvas-eyebrow">{{ eyebrow }}</div>
        <h1>Contacts</h1>
        <p class="lights-summary">{{ count }} people · {{ starred }} starred</p>
      </div>
      <button
        v-if="!isAggregator"
        class="lights-back"
        type="button"
        @click="backToDashboard"
        aria-label="Back to dashboard"
      >
        <Icon name="arrow-left" :size="14" /> Dashboard
      </button>
    </header>

    <!-- Empty state -->
    <div v-if="!allContacts.length" class="sub-empty">
      <Icon name="users" :size="20" />
      <p>No contacts yet · Import or add one to get started.</p>
    </div>

    <div v-else class="contacts-body">
      <!-- ====== LEFT MAIN ====== -->
      <div class="contacts-main">

        <!-- Filter chips -->
        <div class="contacts-chips" role="radiogroup" aria-label="Filter contacts">
          <button
            v-for="f in filterChips"
            :key="f"
            :class="['contacts-chip', { active: activeFilter === f }]"
            role="radio"
            :aria-checked="activeFilter === f"
            @click="activeFilter = f"
          >{{ chipLabel(f) }}</button>
        </div>

        <!-- Contact list -->
        <ul
          class="contacts-list"
          role="list"
          aria-label="Contacts"
        >
          <li
            v-for="c in filteredContacts"
            :key="c.id"
            class="contacts-row"
            role="listitem"
            :aria-label="`${c.name}, ${c.role}${c.organisation ? ', ' + c.organisation : ''}. ${c.channel === 'mail' ? 'Email: ' + c.email : c.channel === 'phone' ? 'Phone: ' + c.phone : 'Message: ' + c.email}. Last seen ${c.lastSeen}.`"
            @click="openContact(c)"
            tabindex="0"
            @keydown.enter.prevent="openContact(c)"
            @keydown.space.prevent="openContact(c)"
          >
            <!-- Avatar -->
            <span
              class="contacts-avatar"
              :style="toneStyle(c.avatarTone)"
              aria-hidden="true"
            >{{ initials(c.name) }}</span>

            <!-- Name + role -->
            <span class="contacts-info">
              <span class="contacts-name">{{ c.name }}</span>
              <span class="contacts-sub">
                {{ c.role }}{{ c.organisation ? ' · ' + c.organisation : '' }}
              </span>
            </span>

            <!-- Workspace badge (aggregator only) -->
            <span
              v-if="c._workspace"
              :class="['contacts-ws-badge', c._workspace === 'Work' ? 'contacts-ws-badge--work' : 'contacts-ws-badge--personal']"
            >{{ c._workspace }}</span>

            <!-- Channel icon -->
            <span class="contacts-channel" aria-hidden="true">
              <Icon :name="c.channel" :size="13" />
            </span>

            <!-- Last seen -->
            <span class="contacts-lastseen">{{ c.lastSeen }}</span>

            <!-- Star button -->
            <button
              class="contacts-star"
              type="button"
              :aria-pressed="isStarred(c)"
              :aria-label="isStarred(c) ? 'Unstar ' + c.name : 'Star ' + c.name"
              :class="{ 'contacts-star--on': isStarred(c) }"
              @click.stop="toggleStar(c)"
            >
              <Icon name="star" :size="13" />
            </button>
          </li>
        </ul>

        <!-- Empty filter state -->
        <div v-if="filteredContacts.length === 0 && allContacts.length > 0" class="sub-empty">
          <Icon name="users" :size="16" />
          <p>No contacts match this filter.</p>
        </div>

      </div>

      <!-- ====== RIGHT RAIL ====== -->
      <section class="contacts-rail" role="region" aria-label="Contacts quick actions">

        <!-- Quick actions -->
        <div class="contacts-rail-card">
          <p class="contacts-rail-title">Quick actions</p>
          <div class="contacts-actions">
            <button class="contacts-action-btn" type="button" @click="newContact">
              <Icon name="user-plus" :size="13" aria-hidden="true" /> New contact
            </button>
            <button class="contacts-action-btn" type="button" @click="importCsv">
              <Icon name="upload" :size="13" aria-hidden="true" /> Import CSV
            </button>
            <button class="contacts-action-btn" type="button" @click="syncFrom">
              <Icon name="refresh-cw" :size="13" aria-hidden="true" /> Sync from...
            </button>
          </div>
        </div>

        <!-- Frequent -->
        <div class="contacts-rail-card">
          <p class="contacts-rail-title">Frequent</p>
          <ul class="contacts-frequent-list" role="list" aria-label="Frequent contacts">
            <li
              v-for="c in frequentContacts"
              :key="c.id"
              class="contacts-frequent-row"
              role="listitem"
            >
              <span
                class="contacts-avatar contacts-avatar--sm"
                :style="toneStyle(c.avatarTone)"
                aria-hidden="true"
              >{{ initials(c.name) }}</span>
              <span class="contacts-frequent-info">
                <span class="contacts-name">{{ c.name }}</span>
                <span class="contacts-sub">{{ c.lastSeen }}</span>
              </span>
              <Icon
                v-if="isStarred(c)"
                name="star"
                :size="11"
                class="contacts-frequent-star"
                aria-hidden="true"
              />
            </li>
          </ul>
        </div>

      </section>
    </div>

  </div>
</template>
