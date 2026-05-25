<script setup>
// LifeOS — TelemetryWidget SFC
// Live system telemetry row beneath the dashboard's 4 stat cards. Polls the
// Tauri `telemetry_read` command at the user-configured refresh rate from the
// lifeos store. Outside Tauri (plain Vite dev / Vitest) the widget renders a
// calm placeholder row and does not start the interval — no console errors,
// no zombie timers. When telemetry is disabled in Settings the widget shows
// a paused placeholder regardless of host.

import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();

const DEFAULT_REFRESH_MS = 2000;

// Detect the Tauri host the same way LightsView + the lifeos store do.
const tauriInvoke = () => {
  const t = (typeof window !== "undefined") ? window.__TAURI__ : null;
  return t?.core?.invoke || null;
};

const snapshot = ref(null);
const hasError = ref(false);
const isTauri = ref(false);
let pollTimer = null;

const telemetryEnabled = computed(() => lifeos.telemetryEnabled !== false);
const refreshMs = computed(() => {
  const n = Number(lifeos.telemetryRefreshMs);
  return Number.isFinite(n) && n >= 250 ? n : DEFAULT_REFRESH_MS;
});

const formatBytes = (n) => {
  if (typeof n !== "number" || !isFinite(n) || n < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
};

const formatUptime = (seconds) => {
  if (typeof seconds !== "number" || !isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const memoryPercent = (snap) => {
  if (!snap || !snap.memory_total_bytes) return 0;
  return Math.max(0, Math.min(100, (snap.memory_used_bytes / snap.memory_total_bytes) * 100));
};

const pollOnce = async () => {
  const invoke = tauriInvoke();
  if (!invoke) return;
  try {
    const snap = await invoke("telemetry_read");
    snapshot.value = snap;
    hasError.value = false;
  } catch {
    // Calm voice — surface a single, generic state. The dashboard already shows
    // four working stat cards above us, so we just degrade quietly.
    hasError.value = true;
  }
};

const startPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!isTauri.value || !telemetryEnabled.value) return;
  pollOnce();
  pollTimer = setInterval(pollOnce, refreshMs.value);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

onMounted(() => {
  isTauri.value = !!tauriInvoke();
  startPolling();
});

watch([telemetryEnabled, refreshMs], () => {
  if (!isTauri.value) return;
  if (!telemetryEnabled.value) {
    stopPolling();
    return;
  }
  startPolling();
});

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});

// Build aria-label strings up-front so the markup stays calm.
const cpuLabel = (snap) => snap ? `CPU usage ${snap.cpu_percent.toFixed(0)} percent` : "CPU usage unavailable";
const memLabel = (snap) => snap
  ? `Memory ${formatBytes(snap.memory_used_bytes)} of ${formatBytes(snap.memory_total_bytes)} used`
  : "Memory unavailable";
const netLabel = (snap) => snap
  ? `Network received ${formatBytes(snap.network_rx_bytes)}, sent ${formatBytes(snap.network_tx_bytes)}`
  : "Network unavailable";
const upLabel = (snap) => snap ? `Uptime ${formatUptime(snap.uptime_seconds)}` : "Uptime unavailable";
</script>

<template>
  <section class="telemetry-row" aria-label="System telemetry">
    <div v-if="!isTauri" class="telemetry-placeholder" role="note">
      <Icon name="info" :size="14" />
      <span>Live telemetry is available in the LifeOS desktop app.</span>
    </div>

    <div v-else-if="!telemetryEnabled" class="telemetry-placeholder" role="note">
      <Icon name="info" :size="14" />
      <span>Live telemetry paused. Enable in Settings.</span>
    </div>

    <template v-else>
      <!-- CPU -->
      <div class="telemetry-card"
           role="img"
           :aria-label="cpuLabel(snapshot)">
        <div class="telemetry-head">
          <span class="telemetry-ico telemetry-ico--cyan"><Icon name="cpu" :size="16" /></span>
          <span class="telemetry-label">CPU</span>
        </div>
        <div class="telemetry-value">
          <template v-if="snapshot">{{ snapshot.cpu_percent.toFixed(0) }}<span class="telemetry-unit">%</span></template>
          <template v-else>—</template>
        </div>
        <div class="telemetry-bar" aria-hidden="true">
          <span class="telemetry-bar-fill telemetry-bar-fill--cyan"
                :style="{ width: (snapshot ? Math.max(0, Math.min(100, snapshot.cpu_percent)) : 0) + '%' }" />
        </div>
      </div>

      <!-- Memory -->
      <div class="telemetry-card"
           role="img"
           :aria-label="memLabel(snapshot)">
        <div class="telemetry-head">
          <span class="telemetry-ico telemetry-ico--purple"><Icon name="memory-stick" :size="16" /></span>
          <span class="telemetry-label">Memory</span>
        </div>
        <div class="telemetry-value">
          <template v-if="snapshot">{{ formatBytes(snapshot.memory_used_bytes) }}</template>
          <template v-else>—</template>
        </div>
        <div class="telemetry-meta">
          <template v-if="snapshot">of {{ formatBytes(snapshot.memory_total_bytes) }}</template>
          <template v-else>&nbsp;</template>
        </div>
        <div class="telemetry-bar" aria-hidden="true">
          <span class="telemetry-bar-fill telemetry-bar-fill--purple"
                :style="{ width: memoryPercent(snapshot) + '%' }" />
        </div>
      </div>

      <!-- Network -->
      <div class="telemetry-card"
           role="img"
           :aria-label="netLabel(snapshot)">
        <div class="telemetry-head">
          <span class="telemetry-ico telemetry-ico--green"><Icon name="wifi" :size="16" /></span>
          <span class="telemetry-label">Network</span>
        </div>
        <div class="telemetry-value telemetry-value--small">
          <template v-if="snapshot">{{ formatBytes(snapshot.network_rx_bytes) }}</template>
          <template v-else>—</template>
        </div>
        <div class="telemetry-meta">
          <template v-if="snapshot">rx · tx {{ formatBytes(snapshot.network_tx_bytes) }}</template>
          <template v-else>&nbsp;</template>
        </div>
        <div class="telemetry-bar" aria-hidden="true">
          <span class="telemetry-bar-fill telemetry-bar-fill--green" style="width: 100%" />
        </div>
      </div>

      <!-- Uptime -->
      <div class="telemetry-card"
           role="img"
           :aria-label="upLabel(snapshot)">
        <div class="telemetry-head">
          <span class="telemetry-ico telemetry-ico--cyan"><Icon name="clock" :size="16" /></span>
          <span class="telemetry-label">Uptime</span>
        </div>
        <div class="telemetry-value telemetry-value--small">
          <template v-if="snapshot">{{ formatUptime(snapshot.uptime_seconds) }}</template>
          <template v-else>—</template>
        </div>
        <div class="telemetry-meta">
          <template v-if="snapshot">{{ snapshot.hostname }}</template>
          <template v-else>&nbsp;</template>
        </div>
        <div class="telemetry-bar" aria-hidden="true">
          <span class="telemetry-bar-fill telemetry-bar-fill--cyan" style="width: 100%" />
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* Calm row of four cards mirroring .stat-card metrics without touching its rules. */
.telemetry-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 28px;
}
.telemetry-placeholder {
  grid-column: 1 / -1;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--bg-4);
  background: var(--bg-2);
  color: var(--fg-3);
  font-size: 12px;
}
.telemetry-card {
  border-radius: 14px;
  padding: 16px;
  border: 1px solid var(--bg-4);
  background: var(--bg-2);
  display: flex; flex-direction: column; gap: 4px;
  position: relative; overflow: hidden;
}
.telemetry-head {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 6px;
}
.telemetry-ico {
  width: 32px; height: 32px;
  border-radius: 9px;
  display: grid; place-items: center;
}
.telemetry-ico--cyan {
  background: color-mix(in srgb, var(--lifeos-cyan) 14%, transparent);
  color: var(--lifeos-cyan);
}
.telemetry-ico--purple {
  background: color-mix(in srgb, var(--lifeos-purple) 14%, transparent);
  color: var(--lifeos-purple);
}
.telemetry-ico--green {
  background: color-mix(in srgb, var(--lifeos-green) 14%, transparent);
  color: var(--lifeos-green);
}
.telemetry-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-1);
}
.telemetry-value {
  font-family: var(--font-display);
  font-size: 40px;
  line-height: 1;
  letter-spacing: .03em;
  color: var(--fg-0);
}
.telemetry-value--small {
  font-size: 28px;
}
.telemetry-unit {
  font-size: 18px;
  opacity: .4;
  margin-left: 2px;
}
.telemetry-meta {
  font-size: 11px;
  color: var(--fg-3);
  margin-top: 4px;
  min-height: 14px;
}
.telemetry-bar {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 1px;
  background: var(--bg-4);
}
.telemetry-bar-fill {
  display: block;
  height: 100%;
  transition: width .4s ease-out;
}
.telemetry-bar-fill--cyan { background: var(--lifeos-cyan); }
.telemetry-bar-fill--purple { background: var(--lifeos-purple); }
.telemetry-bar-fill--green { background: var(--lifeos-green); }
</style>
