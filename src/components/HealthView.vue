<script setup>
// LifeOS — HealthView SFC
// Personal → Health subsection: metric cards + sleep bar chart + activity rings + heart-rate sparkline.
// Right rail: today's snapshot + LifeOS suggestion. Static-first, token-only, no new deps.

import { computed } from "vue";
import { useNav } from "@/lib/nav.js";
import Icon from "./Icon.vue";

const nav = useNav();

const health = computed(() => (window).LIFEOS_DATA?.health || { metrics: [], sleep: [], activity: [], heart: [] });

const TONE = (window).TONE || {};
const toneOf = (key) => TONE[key] || { bg: "transparent", fg: "var(--fg-0)", bd: "var(--bg-5)" };

// ---------- Sleep chart helpers ----------
const SLEEP_TARGET_H = 8;
const SLEEP_SVG_H = 80; // px height of bar area
const barHeight = (hours) => Math.round((hours / SLEEP_TARGET_H) * SLEEP_SVG_H);
const targetY = Math.round(SLEEP_SVG_H * (1 - (SLEEP_TARGET_H / SLEEP_TARGET_H))); // = 0 (top)

// ---------- Activity rings helpers ----------
// Normalise each ring value to 0–1 (clamped). Goal maxima: move 600 cal, exercise 60 min, stand 14 hr.
const MOVE_GOAL = 600;
const EX_GOAL   = 60;
const STAND_GOAL = 14;
const R_OUTER = 18;
const R_MID   = 12;
const R_INNER = 6;
const ringCircumference = (r) => Math.round(2 * Math.PI * r * 10) / 10;
const ringDash = (r, fraction) => {
  const c = ringCircumference(r);
  const fill = Math.min(fraction, 1) * c;
  return `${fill} ${c - fill}`;
};

// ---------- Heart sparkline helpers ----------
const heartData = computed(() => health.value.heart);
const bpms = computed(() => heartData.value.map((s) => s.bpm));
const bpmMin = computed(() => Math.min(...bpms.value));
const bpmMax = computed(() => Math.max(...bpms.value));
const bpmCurrent = computed(() => bpms.value[bpms.value.length - 1] ?? 0);
const bpmMinIdx = computed(() => bpms.value.indexOf(bpmMin.value));
const bpmMaxIdx = computed(() => bpms.value.indexOf(bpmMax.value));

const SPARK_W = 240;
const SPARK_H = 48;
const sparkPoints = computed(() => {
  const data = heartData.value;
  if (data.length < 2) return "";
  const lo = bpmMin.value - 4;
  const hi = bpmMax.value + 4;
  return data.map((s, i) => {
    const x = Math.round((i / (data.length - 1)) * SPARK_W);
    const y = Math.round(SPARK_H - ((s.bpm - lo) / (hi - lo)) * SPARK_H);
    return `${x},${y}`;
  }).join(" ");
});

const sparkX = (idx) => {
  const n = heartData.value.length;
  return n < 2 ? 0 : Math.round((idx / (n - 1)) * SPARK_W);
};
const sparkY = (bpm) => {
  const lo = bpmMin.value - 4;
  const hi = bpmMax.value + 4;
  return Math.round(SPARK_H - ((bpm - lo) / (hi - lo)) * SPARK_H);
};

// ---------- Nav ----------
const backToDashboard = () => nav.clearSub();
</script>

<template>
  <div class="canvas health-canvas" role="region" aria-label="Health">

    <header class="lights-head">
      <div>
        <div class="canvas-eyebrow">Personal · Health</div>
        <h1>Health</h1>
        <p class="lights-summary">Your week at a glance.</p>
      </div>
      <button class="lights-back" type="button" @click="backToDashboard" aria-label="Back to dashboard">
        <Icon name="arrow-left" :size="14" /> Dashboard
      </button>
    </header>

    <div class="health-body">
      <!-- ====== LEFT MAIN ====== -->
      <div class="health-main">

        <!-- Metric cards -->
        <div class="health-stats-grid">
          <div
            v-for="m in health.metrics"
            :key="m.id"
            class="health-stat-card"
            role="img"
            :aria-label="`${m.label}: ${m.value} ${m.unit}, ${m.delta}`"
            :style="{
              background: `linear-gradient(180deg, ${toneOf(m.tone).bg} 0%, transparent 60%), var(--bg-2)`,
              borderColor: toneOf(m.tone).bd,
            }"
          >
            <div class="health-stat-head">
              <span class="health-stat-ico" :style="{ background: toneOf(m.tone).bg, color: toneOf(m.tone).fg }" aria-hidden="true">
                <Icon :name="m.icon" :size="16" />
              </span>
              <span class="health-stat-delta" :style="{ color: toneOf(m.tone).fg }">{{ m.delta }}</span>
            </div>
            <div class="health-stat-value">{{ m.value }}<span class="health-stat-unit">{{ m.unit }}</span></div>
            <div class="health-stat-label">{{ m.label }}</div>
          </div>
        </div>

        <!-- Sleep chart -->
        <section class="health-chart-card" role="region" aria-labelledby="sleep-title">
          <h2 id="sleep-title" class="health-chart-title">Sleep · last 7 nights</h2>
          <svg
            class="health-chart-svg"
            :viewBox="`0 0 ${health.sleep.length * 32} ${SLEEP_SVG_H + 20}`"
            role="img"
            :aria-label="`Sleep bar chart. ${health.sleep.map(n => n.day + ' ' + n.hours + 'h').join(', ')}.`"
            aria-hidden="false"
          >
            <!-- Target line at 8h -->
            <line
              x1="0" :y1="0"
              :x2="health.sleep.length * 32" :y2="0"
              stroke="var(--lifeos-cyan, #00d4ff)"
              stroke-width="1"
              stroke-dasharray="3 3"
              opacity="0.35"
              aria-hidden="true"
            />
            <g v-for="(night, i) in health.sleep" :key="night.day" aria-hidden="true">
              <rect
                :x="i * 32 + 4"
                :y="SLEEP_SVG_H - barHeight(night.hours)"
                :width="24"
                :height="barHeight(night.hours)"
                rx="4"
                fill="var(--lifeos-cyan, #00d4ff)"
                opacity="0.75"
              >
                <title>{{ night.day }}: {{ night.hours }}h, {{ night.quality }}% quality</title>
              </rect>
              <text
                :x="i * 32 + 16"
                :y="SLEEP_SVG_H + 14"
                text-anchor="middle"
                font-size="9"
                fill="var(--fg-3, #555570)"
              >{{ night.day }}</text>
            </g>
          </svg>
        </section>

        <!-- Activity rings -->
        <section class="health-chart-card" role="region" aria-labelledby="activity-title">
          <h2 id="activity-title" class="health-chart-title">Activity rings · last 7 days</h2>
          <div class="health-activity-row">
            <div
              v-for="(day, i) in health.activity"
              :key="day.day"
              :class="['health-activity-day', { 'health-activity-today': i === health.activity.length - 1 }]"
            >
              <svg
                :width="(R_OUTER + 2) * 2"
                :height="(R_OUTER + 2) * 2"
                role="img"
                :aria-label="`${day.day}: move ${day.move} cal, exercise ${day.exercise} min, stand ${day.stand} hr`"
              >
                <!-- Move ring (outer, cyan) -->
                <circle
                  :cx="R_OUTER + 2" :cy="R_OUTER + 2" :r="R_OUTER"
                  fill="none" stroke="var(--bg-3, #222238)" stroke-width="4"
                  aria-hidden="true"
                />
                <circle
                  :cx="R_OUTER + 2" :cy="R_OUTER + 2" :r="R_OUTER"
                  fill="none" stroke="var(--lifeos-cyan, #00d4ff)" stroke-width="4"
                  stroke-linecap="round"
                  :stroke-dasharray="ringDash(R_OUTER, day.move / MOVE_GOAL)"
                  transform="rotate(-90)" :style="`transform-origin: ${R_OUTER + 2}px ${R_OUTER + 2}px`"
                  aria-hidden="true"
                />
                <!-- Exercise ring (mid, purple) -->
                <circle
                  :cx="R_OUTER + 2" :cy="R_OUTER + 2" :r="R_MID"
                  fill="none" stroke="var(--bg-3, #222238)" stroke-width="4"
                  aria-hidden="true"
                />
                <circle
                  :cx="R_OUTER + 2" :cy="R_OUTER + 2" :r="R_MID"
                  fill="none" stroke="var(--lifeos-purple, #9b7bff)" stroke-width="4"
                  stroke-linecap="round"
                  :stroke-dasharray="ringDash(R_MID, day.exercise / EX_GOAL)"
                  transform="rotate(-90)" :style="`transform-origin: ${R_OUTER + 2}px ${R_OUTER + 2}px`"
                  aria-hidden="true"
                />
                <!-- Stand ring (inner, green) -->
                <circle
                  :cx="R_OUTER + 2" :cy="R_OUTER + 2" :r="R_INNER"
                  fill="none" stroke="var(--bg-3, #222238)" stroke-width="4"
                  aria-hidden="true"
                />
                <circle
                  :cx="R_OUTER + 2" :cy="R_OUTER + 2" :r="R_INNER"
                  fill="none" stroke="var(--lifeos-green, #00e676)" stroke-width="4"
                  stroke-linecap="round"
                  :stroke-dasharray="ringDash(R_INNER, day.stand / STAND_GOAL)"
                  transform="rotate(-90)" :style="`transform-origin: ${R_OUTER + 2}px ${R_OUTER + 2}px`"
                  aria-hidden="true"
                />
              </svg>
              <span class="health-activity-label">{{ day.day }}</span>
            </div>
          </div>
        </section>

        <!-- Heart rate sparkline -->
        <section class="health-chart-card" role="region" aria-labelledby="heart-title">
          <h2 id="heart-title" class="health-chart-title">Heart rate today</h2>
          <svg
            class="health-chart-svg"
            :viewBox="`0 0 ${SPARK_W} ${SPARK_H + 4}`"
            role="img"
            :aria-label="`Heart rate sparkline. Low ${bpmMin} bpm, high ${bpmMax} bpm, current ${bpmCurrent} bpm.`"
          >
            <polyline
              class="heart-sparkline-path"
              :points="sparkPoints"
              fill="none"
              stroke="var(--lifeos-purple, #9b7bff)"
              stroke-width="1.5"
              stroke-linejoin="round"
              stroke-linecap="round"
              aria-hidden="true"
            />
            <!-- Low marker -->
            <circle
              v-if="heartData.length"
              :cx="sparkX(bpmMinIdx)" :cy="sparkY(bpmMin)"
              r="3" fill="var(--lifeos-cyan, #00d4ff)"
              aria-hidden="true"
            >
              <title>Low: {{ bpmMin }} bpm at {{ heartData[bpmMinIdx]?.time }}</title>
            </circle>
            <!-- High marker -->
            <circle
              v-if="heartData.length"
              :cx="sparkX(bpmMaxIdx)" :cy="sparkY(bpmMax)"
              r="3" fill="var(--status-warn, #ffb020)"
              aria-hidden="true"
            >
              <title>High: {{ bpmMax }} bpm at {{ heartData[bpmMaxIdx]?.time }}</title>
            </circle>
            <!-- Current marker -->
            <circle
              v-if="heartData.length"
              :cx="sparkX(heartData.length - 1)" :cy="sparkY(bpmCurrent)"
              r="3" fill="var(--lifeos-green, #00e676)"
              aria-hidden="true"
            >
              <title>Current: {{ bpmCurrent }} bpm</title>
            </circle>
            <!-- Labels -->
            <text
              v-if="heartData.length"
              :x="sparkX(bpmMinIdx)" :y="sparkY(bpmMin) + 12"
              text-anchor="middle" font-size="8" fill="var(--lifeos-cyan, #00d4ff)"
              aria-hidden="true"
            >{{ bpmMin }}</text>
            <text
              v-if="heartData.length"
              :x="sparkX(bpmMaxIdx)" :y="sparkY(bpmMax) - 5"
              text-anchor="middle" font-size="8" fill="var(--status-warn, #ffb020)"
              aria-hidden="true"
            >{{ bpmMax }}</text>
          </svg>
        </section>

      </div>

      <!-- ====== RIGHT RAIL ====== -->
      <section class="health-rail" role="region" aria-label="Health snapshot">

        <!-- Today's snapshot -->
        <div class="health-rail-card">
          <p class="health-rail-title">Today's snapshot</p>
          <div class="health-snap-row">
            <span class="health-snap-key">
              <Icon name="heart-pulse" :size="13" aria-hidden="true" />
              Avg HR
            </span>
            <span class="health-snap-val">{{ bpmCurrent }} bpm</span>
          </div>
          <div class="health-snap-row">
            <span class="health-snap-key">
              <Icon name="activity" :size="13" aria-hidden="true" />
              Active mins
            </span>
            <span class="health-snap-val">
              {{ health.metrics.find(m => m.id === 'active')?.value ?? '—' }}
            </span>
          </div>
          <div class="health-snap-row">
            <span class="health-snap-key">
              <Icon name="moon" :size="13" aria-hidden="true" />
              Sleep
            </span>
            <span class="health-snap-val">
              {{ health.metrics.find(m => m.id === 'sleep')?.value ?? '—' }}
            </span>
          </div>
          <div class="health-snap-row">
            <span class="health-snap-key">
              <Icon name="droplet" :size="13" aria-hidden="true" />
              Hydration
            </span>
            <span class="health-snap-val">Good</span>
          </div>
        </div>

        <!-- LifeOS suggests -->
        <div class="health-rail-card" role="status" aria-live="polite">
          <p class="health-rail-title">LifeOS suggests</p>
          <p class="health-suggest">
            <strong>Carry the momentum.</strong>
            You moved 22% more than the same day last week. Keep it going.
          </p>
        </div>

      </section>
    </div>

  </div>
</template>
