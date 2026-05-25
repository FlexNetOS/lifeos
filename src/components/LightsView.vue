<script setup>
// LifeOS — LightsView SFC (v2)
// Spatial-grid Lights dashboard: scene strip · room grid · schedule timeline.
// v2 adds: brightness sliders on active tiles, color-temp Kelvin meter,
// roving tabindex on the scene radiogroup, schedule edit/delete affordance,
// and a Tauri-backed persistence layer that no-ops outside the desktop shell.

import { ref, computed, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useToasts } from "@/stores/toasts.js";
import { useNav } from "@/lib/nav.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();
const toasts = useToasts();
const nav = useNav();

const lighting = computed(() => (window).LIFEOS_DATA?.lighting || { scenes: [], rooms: [], schedules: [] });

// Local UI-only overrides. id → true/false. Hydrated from Tauri on mount when available.
const overrides = ref({});
// Brightness overrides (id → 0-100). Sibling to `overrides` so the read paths stay typed.
const brightnessOverrides = ref({});

const isLightOn = (light) => (light.id in overrides.value) ? overrides.value[light.id] : !!light.isOn;
const lightBrightness = (light) => (light.id in brightnessOverrides.value)
  ? brightnessOverrides.value[light.id]
  : (light.brightness ?? 0);
const activeInRoom = (room) => room.devices.filter(isLightOn).length;

// Default color temperature for lights that don't carry one (warm-neutral).
const DEFAULT_COLOR_TEMP = 4000;
const KELVIN_MIN = 2000;
const KELVIN_MAX = 6500;
const roomAverageKelvin = (room) => {
  const on = room.devices.filter(isLightOn);
  if (!on.length) return null;
  const sum = on.reduce((n, l) => n + (l.colorTemp ?? DEFAULT_COLOR_TEMP), 0);
  return Math.round(sum / on.length);
};
const kelvinPercent = (k) => {
  const clamped = Math.max(KELVIN_MIN, Math.min(KELVIN_MAX, k));
  return ((clamped - KELVIN_MIN) / (KELVIN_MAX - KELVIN_MIN)) * 100;
};

const totalCount = computed(() => lighting.value.rooms.reduce((n, r) => n + (r.devices?.length || 0), 0));
const activeCount = computed(() => lighting.value.rooms.reduce((n, r) => n + activeInRoom(r), 0));

const activeSceneId = ref(lighting.value.scenes.find((s) => s.active)?.id || lighting.value.scenes[0]?.id || "");
const announcement = ref("");

const pickScene = (id) => {
  activeSceneId.value = id;
  const scene = lighting.value.scenes.find((s) => s.id === id);
  if (scene) announcement.value = `${scene.label} scene selected`;
  schedulePersist();
};
const toggleLight = (light) => {
  const next = !isLightOn(light);
  overrides.value = { ...overrides.value, [light.id]: next };
  announcement.value = `${light.label} turned ${next ? 'on' : 'off'}`;
  schedulePersist();
};
const setBrightness = (light, value) => {
  brightnessOverrides.value = { ...brightnessOverrides.value, [light.id]: Number(value) };
  schedulePersist();
};

// ---------- Roving tabindex on the scene radiogroup ----------
const sceneRefs = ref([]);
const setSceneRef = (el, idx) => { if (el) sceneRefs.value[idx] = el; };
const cycleScene = (direction) => {
  const scenes = lighting.value.scenes;
  if (!scenes.length) return;
  const i = scenes.findIndex((s) => s.id === activeSceneId.value);
  const nextIdx = (i + direction + scenes.length) % scenes.length;
  pickScene(scenes[nextIdx].id);
  nextTick(() => {
    const btn = sceneRefs.value[nextIdx];
    if (btn && typeof btn.focus === "function") btn.focus();
  });
};

// ---------- Schedule edit / delete (routes to AI chat as Stage 2 CTA pattern) ----------
const editSchedule = (s) => {
  lifeos.sendAiMessage(`Edit schedule "${s.label}" (${s.time}, ${s.days}).`, { source: "lights" });
  toasts.info(`Editing "${s.label}" — I'll surface this in your AI chat shortly.`);
  announcement.value = `Editing ${s.label}`;
};
const deleteSchedule = (s) => {
  lifeos.sendAiMessage(`Delete schedule "${s.label}" (${s.time}, ${s.days}).`, { source: "lights" });
  toasts.warn(`Deleting "${s.label}" — I'll surface this in your AI chat shortly.`);
  announcement.value = `Deleting ${s.label}`;
};

const backToDashboard = () => nav.clearSub();

// ---------- Tauri-backed persistence (no-op in plain Vite dev / tests) ----------
const tauriInvoke = () => {
  const t = (typeof window !== "undefined") ? window.__TAURI__ : null;
  return t?.core?.invoke || null;
};
let persistTimer = null;
const PERSIST_DEBOUNCE_MS = 200;
const buildState = () => JSON.stringify({
  overrides: overrides.value,
  brightness: brightnessOverrides.value,
  activeSceneId: activeSceneId.value,
});
const flushPersist = () => {
  const invoke = tauriInvoke();
  if (!invoke) return;
  invoke("lights_state_write", { state: buildState() }).catch(() => { /* swallow — UI must not block */ });
};
const schedulePersist = () => {
  if (!tauriInvoke()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { persistTimer = null; flushPersist(); }, PERSIST_DEBOUNCE_MS);
};
const hydrateFromTauri = async () => {
  const invoke = tauriInvoke();
  if (!invoke) return;
  try {
    const raw = await invoke("lights_state_read");
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") {
      if (parsed.overrides && typeof parsed.overrides === "object") overrides.value = { ...parsed.overrides };
      if (parsed.brightness && typeof parsed.brightness === "object") brightnessOverrides.value = { ...parsed.brightness };
      if (typeof parsed.activeSceneId === "string" && parsed.activeSceneId) activeSceneId.value = parsed.activeSceneId;
    }
  } catch { /* fresh slate is fine */ }
};

onMounted(() => { hydrateFromTauri(); });
onBeforeUnmount(() => {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; flushPersist(); }
});
</script>

<template>
  <div class="canvas lights-canvas" role="region" aria-label="Home lighting">
    <div class="sr-only" role="status" aria-live="polite">{{ announcement }}</div>
    <div v-if="!lighting.rooms.length" class="sub-empty">
      <Icon name="lamp" :size="20" />
      <p>No rooms wired yet. Ask LifeOS to set up your home lighting.</p>
    </div>
    <div v-else class="lights-main">
      <header class="lights-head">
        <div>
          <div class="canvas-eyebrow">Home automation · Lights</div>
          <h1>Lights</h1>
          <p class="lights-summary">{{ activeCount }} of {{ totalCount }} on · {{ lighting.rooms.length }} rooms</p>
        </div>
        <button class="lights-back" type="button" @click="backToDashboard" aria-label="Back to dashboard">
          <Icon name="arrow-left" :size="14" /> Dashboard
        </button>
      </header>

      <div class="scene-strip"
           role="radiogroup"
           aria-label="Lighting scenes"
           @keydown.right.prevent="cycleScene(1)"
           @keydown.left.prevent="cycleScene(-1)">
        <button v-for="(s, idx) in lighting.scenes"
                :key="s.id"
                :ref="(el) => setSceneRef(el, idx)"
                :class="['scene-btn']"
                type="button"
                role="radio"
                :aria-checked="s.id === activeSceneId"
                :tabindex="s.id === activeSceneId ? 0 : -1"
                :style="s.id === activeSceneId ? { background: s.gradient } : undefined"
                @click="pickScene(s.id)">
          <Icon :name="s.icon" :size="14" /> {{ s.label }}
        </button>
      </div>

      <div class="room-grid">
        <section v-for="room in lighting.rooms"
                 :key="room.id"
                 class="room-card"
                 role="region"
                 :aria-labelledby="`room-${room.id}-title`">
          <div class="room-head">
            <span class="room-ico" aria-hidden="true"><Icon :name="room.icon" :size="16" /></span>
            <h2 :id="`room-${room.id}-title`" class="room-title">{{ room.label }}</h2>
            <span :class="['room-count', { 'has-active': activeInRoom(room) > 0 }]">
              {{ activeInRoom(room) }} on
            </span>
          </div>
          <div class="light-tiles">
            <div v-for="light in room.devices"
                 :key="light.id"
                 class="light-tile-wrap">
              <button class="light-tile"
                      type="button"
                      role="switch"
                      :aria-checked="isLightOn(light)"
                      :aria-label="`${light.label}, ${isLightOn(light) ? 'on' : 'off'}`"
                      @click="toggleLight(light)">
                <span class="tile-head">
                  <Icon :name="light.type === 'strip' ? 'minus' : light.type === 'pendant' ? 'circle' : 'lamp'" :size="13" />
                  <span class="tile-meta">{{ isLightOn(light) ? `${lightBrightness(light)}%` : 'off' }}</span>
                </span>
                <span class="tile-label">{{ light.label }}</span>
              </button>
              <input v-if="isLightOn(light)"
                     class="tile-brightness"
                     type="range"
                     min="0"
                     max="100"
                     step="1"
                     :value="lightBrightness(light)"
                     :aria-label="`Brightness for ${light.label}`"
                     @input="setBrightness(light, $event.target.value)"
                     @click.stop />
            </div>
          </div>
          <div v-if="activeInRoom(room) > 0 && roomAverageKelvin(room) !== null"
               class="kelvin-meter"
               role="group"
               :aria-label="`Average color temperature for ${room.label}`">
            <div class="kelvin-track">
              <span class="kelvin-marker"
                    :style="{ left: kelvinPercent(roomAverageKelvin(room)) + '%' }"
                    aria-hidden="true" />
            </div>
            <span class="kelvin-value">{{ roomAverageKelvin(room) }}K</span>
          </div>
        </section>
      </div>
    </div>

    <section v-if="lighting.rooms.length" class="schedule-timeline" role="region" aria-label="Lighting schedules">
      <h3 class="schedule-head">Schedules</h3>
      <ul class="schedule-list">
        <li v-for="s in lighting.schedules" :key="s.id" class="schedule-row">
          <span class="schedule-dot" aria-hidden="true" />
          <div class="schedule-body">
            <div class="schedule-time">{{ s.time }}</div>
            <div class="schedule-label">{{ s.label }}</div>
            <div class="schedule-detail">{{ s.days }} · {{ s.sceneId }} scene</div>
          </div>
          <div class="schedule-actions">
            <button class="schedule-action"
                    type="button"
                    :aria-label="`Edit ${s.label}`"
                    @click="editSchedule(s)">
              <Icon name="pencil" :size="13" />
            </button>
            <button class="schedule-action"
                    type="button"
                    :aria-label="`Delete ${s.label}`"
                    @click="deleteSchedule(s)">
              <Icon name="x" :size="13" />
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
