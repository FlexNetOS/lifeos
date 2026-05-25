<script setup>
// LifeOS — IoTView SFC
// IoT devices dashboard: room filter chips · device list · signal strength rail.
// Mirrors the LightsView/FilesView/HealthView canvas pattern.

import { ref, computed } from "vue";
import { useNav } from "@/lib/nav.js";
import Icon from "./Icon.vue";

const nav = useNav();

const iot = computed(() => (window).LIFEOS_DATA?.iot || { rooms: [], devices: [], signals: [] });

// null = all rooms; string = room id
const activeRoomId = ref(null);

const onlineDevices = computed(() => iot.value.devices.filter((d) => d.online));
const onlineCount = computed(() => onlineDevices.value.length);
const totalCount = computed(() => iot.value.devices.length);

const visibleDevices = computed(() => {
  const id = activeRoomId.value;
  const all = iot.value.devices;
  const filtered = id ? all.filter((d) => d.roomId === id) : all;
  // Online devices first, then offline
  return [
    ...filtered.filter((d) => d.online),
    ...filtered.filter((d) => !d.online),
  ];
});

const selectRoom = (roomId) => {
  activeRoomId.value = activeRoomId.value === roomId ? null : roomId;
};

const avgLatency = computed(() => {
  const on = onlineDevices.value.filter((d) => d.latencyMs > 0);
  if (!on.length) return 0;
  return Math.round(on.reduce((n, d) => n + d.latencyMs, 0) / on.length);
});

const latencyStatus = computed(() => {
  const ms = avgLatency.value;
  if (ms === 0) return { label: "No data", tone: "neutral" };
  if (ms < 30) return { label: "Good", tone: "cyan" };
  if (ms < 80) return { label: "OK", tone: "warn" };
  return { label: "Slow", tone: "err" };
});

const deviceIcon = (type) => {
  const map = {
    tv:      "tv",
    audio:   "speaker",
    climate: "thermometer",
    sensor:  "wifi",
    display: "monitor",
    light:   "lamp",
    plug:    "plug",
    control: "server",
  };
  return map[type] || "wifi";
};

const roomLabel = (roomId) => {
  const room = iot.value.rooms.find((r) => r.id === roomId);
  return room ? room.label : roomId;
};

const backToDashboard = () => nav.clearSub();

const isBatteryLow = (battery) => battery !== null && battery < 20;
</script>

<template>
  <div class="canvas iot-canvas" role="region" aria-label="IoT devices">
    <div v-if="!iot.devices.length" class="sub-empty">
      <Icon name="wifi" :size="20" />
      <p>No IoT devices found. Ask LifeOS to scan your network.</p>
    </div>

    <div v-else class="iot-main">
      <header class="lights-head">
        <div>
          <div class="canvas-eyebrow">Home automation · IoT</div>
          <h1>IoT devices</h1>
          <p class="lights-summary">
            {{ onlineCount }} of {{ totalCount }} online across {{ iot.rooms.length }} rooms.
          </p>
        </div>
        <button class="lights-back" type="button" @click="backToDashboard" aria-label="Back to dashboard">
          <Icon name="arrow-left" :size="14" /> Dashboard
        </button>
      </header>

      <!-- Room filter chips -->
      <div class="iot-room-filter"
           role="radiogroup"
           aria-label="Filter by room">
        <button
          :class="['iot-chip', { 'iot-chip--active': activeRoomId === null }]"
          type="button"
          role="radio"
          :aria-checked="activeRoomId === null"
          :tabindex="activeRoomId === null ? 0 : -1"
          @click="activeRoomId = null">
          All rooms
        </button>
        <button
          v-for="room in iot.rooms"
          :key="room.id"
          :class="['iot-chip', { 'iot-chip--active': activeRoomId === room.id }]"
          type="button"
          role="radio"
          :aria-checked="activeRoomId === room.id"
          :tabindex="activeRoomId === room.id ? 0 : -1"
          @click="selectRoom(room.id)">
          <Icon :name="room.icon" :size="13" aria-hidden="true" />
          {{ room.label }}
        </button>
      </div>

      <div class="iot-body">
        <!-- Device list -->
        <section class="iot-device-section" aria-label="Device list">
          <div v-if="visibleDevices.length === 0" class="iot-empty">
            <Icon name="wifi" :size="16" />
            <span>No devices in this room.</span>
          </div>
          <ul v-else class="iot-device-list" role="list">
            <li
              v-for="device in visibleDevices"
              :key="device.id"
              :class="['iot-device-row', { 'iot-device-row--offline': !device.online }]"
              role="listitem"
              :aria-label="`${device.label}, ${roomLabel(device.roomId)}, ${device.online ? 'online' : 'offline'}${isBatteryLow(device.battery) ? ', low battery' : ''}`">
              <!-- Device icon -->
              <span class="iot-device-icon" aria-hidden="true">
                <Icon :name="deviceIcon(device.type)" :size="15" />
              </span>

              <!-- Label + room -->
              <span class="iot-device-body">
                <span class="iot-device-label">{{ device.label }}</span>
                <span class="iot-device-room">{{ roomLabel(device.roomId) }}</span>
              </span>

              <!-- Status dot -->
              <span
                :class="['iot-status-dot', device.online ? 'iot-status-dot--online' : 'iot-status-dot--offline']"
                :aria-label="device.online ? 'online' : 'offline'"
                role="img" />

              <!-- Latency -->
              <span class="iot-device-latency" aria-label="Latency">
                {{ device.online && device.latencyMs > 0 ? `${device.latencyMs} ms` : '—' }}
              </span>

              <!-- Signal bars (5-bar mini SVG) -->
              <span class="iot-signal-bars" aria-label="Signal strength" aria-hidden="true">
                <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
                  <rect x="0"  y="10" width="3" height="4"  :fill="device.signal >= 20 ? 'currentColor' : 'var(--border-subtle)'" />
                  <rect x="4"  y="7"  width="3" height="7"  :fill="device.signal >= 40 ? 'currentColor' : 'var(--border-subtle)'" />
                  <rect x="8"  y="4"  width="3" height="10" :fill="device.signal >= 60 ? 'currentColor' : 'var(--border-subtle)'" />
                  <rect x="12" y="2"  width="3" height="12" :fill="device.signal >= 80 ? 'currentColor' : 'var(--border-subtle)'" />
                  <rect x="16" y="0"  width="3" height="14" :fill="device.signal >= 95 ? 'currentColor' : 'var(--border-subtle)'" />
                </svg>
              </span>

              <!-- Battery -->
              <span
                v-if="device.battery !== null"
                :class="['iot-device-battery', { 'iot-device-battery--low': isBatteryLow(device.battery) }]"
                :aria-label="`Battery ${device.battery}%${isBatteryLow(device.battery) ? ', low battery' : ''}`">
                {{ device.battery }}%{{ isBatteryLow(device.battery) ? ' · low battery' : '' }}
              </span>
              <span v-else class="iot-device-battery iot-device-battery--wired" aria-label="Wired">
                —
              </span>

              <!-- Last seen -->
              <span class="iot-device-last-seen" aria-hidden="true">{{ device.lastSeen }}</span>
            </li>
          </ul>
        </section>

        <!-- Right rail -->
        <section class="iot-rail" role="region" aria-label="Network overview">
          <!-- Signal strength card -->
          <section class="iot-rail-card" aria-label="Signal strength">
            <h2 class="iot-rail-head">Signal strength</h2>
            <ul class="iot-signal-list" role="list">
              <li
                v-for="sig in iot.signals"
                :key="sig.id"
                class="iot-signal-row"
                role="listitem"
                :aria-label="`${sig.label}, ${sig.bars} of 5 bars, ${sig.meta}`">
                <span :class="['iot-signal-label', `iot-signal-label--${sig.kind}`]">
                  {{ sig.label }}
                </span>
                <span class="iot-signal-bars-wrap" aria-hidden="true">
                  <svg width="28" height="14" viewBox="0 0 28 14" fill="none">
                    <rect x="0"  y="10" width="4" height="4"  :fill="sig.bars >= 1 ? 'currentColor' : 'var(--border-subtle)'" />
                    <rect x="5"  y="7"  width="4" height="7"  :fill="sig.bars >= 2 ? 'currentColor' : 'var(--border-subtle)'" />
                    <rect x="10" y="4"  width="4" height="10" :fill="sig.bars >= 3 ? 'currentColor' : 'var(--border-subtle)'" />
                    <rect x="15" y="2"  width="4" height="12" :fill="sig.bars >= 4 ? 'currentColor' : 'var(--border-subtle)'" />
                    <rect x="20" y="0"  width="4" height="14" :fill="sig.bars >= 5 ? 'currentColor' : 'var(--border-subtle)'" />
                  </svg>
                </span>
                <span class="iot-signal-meta">{{ sig.meta }}</span>
              </li>
            </ul>
          </section>

          <!-- Latency card -->
          <section class="iot-rail-card" aria-label="Average latency">
            <h2 class="iot-rail-head">Latency</h2>
            <div class="iot-latency-row">
              <span class="iot-latency-value">{{ avgLatency > 0 ? `${avgLatency} ms` : '—' }}</span>
              <span :class="['iot-latency-pill', `iot-latency-pill--${latencyStatus.tone}`]">
                {{ latencyStatus.label }}
              </span>
            </div>
            <p class="iot-latency-sub">Average across {{ onlineCount }} online devices</p>
          </section>
        </section>
      </div>
    </div>
  </div>
</template>
