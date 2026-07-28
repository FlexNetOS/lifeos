<script>
  // LifeOS — LightsView SFC (Svelte port of LightsView.vue, v2)
  // Spatial-grid Lights dashboard: scene strip · room grid · schedule timeline.
  // v2 adds: brightness sliders on active tiles, color-temp Kelvin meter,
  // roving tabindex on the scene radiogroup, schedule edit/delete affordance,
  // and a Tauri-backed persistence layer that no-ops outside the desktop shell.
  import { onMount, onDestroy, tick } from "svelte";
  import { useLifeos } from "@/stores/lifeos.js";
  import { useToasts } from "@/stores/toasts-native";
  import { createNav } from "@/lib/svelte-nav.js";
  import { router as appRouter } from "@/router";
  import Icon from "./Icon.svelte";

  let { router = appRouter } = $props();

  const lifeos = useLifeos();
  const toasts = useToasts();
  const nav = createNav(router);

  let lighting = $derived(globalThis.LIFEOS_DATA?.lighting || { scenes: [], rooms: [], schedules: [] });

  // Local UI-only overrides. id → true/false. Hydrated from Tauri on mount when available.
  let overrides = $state({});
  // Brightness overrides (id → 0-100). Sibling to `overrides` so the read paths stay typed.
  let brightnessOverrides = $state({});

  const isLightOn = (light) => (light.id in overrides) ? overrides[light.id] : !!light.isOn;
  const lightBrightness = (light) => (light.id in brightnessOverrides)
    ? brightnessOverrides[light.id]
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

  let totalCount = $derived(lighting.rooms.reduce((n, r) => n + (r.devices?.length || 0), 0));
  let activeCount = $derived(lighting.rooms.reduce((n, r) => n + activeInRoom(r), 0));

  let activeSceneId = $state(lighting.scenes.find((s) => s.active)?.id || lighting.scenes[0]?.id || "");
  let announcement = $state("");

  const pickScene = (id) => {
    activeSceneId = id;
    const scene = lighting.scenes.find((s) => s.id === id);
    if (scene) announcement = `${scene.label} scene selected`;
    schedulePersist();
  };
  const toggleLight = (light) => {
    const next = !isLightOn(light);
    overrides = { ...overrides, [light.id]: next };
    announcement = `${light.label} turned ${next ? 'on' : 'off'}`;
    schedulePersist();
  };
  const setBrightness = (light, value) => {
    brightnessOverrides = { ...brightnessOverrides, [light.id]: Number(value) };
    schedulePersist();
  };

  // ---------- Roving tabindex on the scene radiogroup ----------
  let sceneRefs = $state([]);
  const cycleScene = (direction) => {
    const scenes = lighting.scenes;
    if (!scenes.length) return;
    const i = scenes.findIndex((s) => s.id === activeSceneId);
    const nextIdx = (i + direction + scenes.length) % scenes.length;
    pickScene(scenes[nextIdx].id);
    tick().then(() => {
      const btn = sceneRefs[nextIdx];
      if (btn && typeof btn.focus === "function") btn.focus();
    });
  };
  const onSceneStripKeydown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); cycleScene(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); cycleScene(-1); }
  };

  // ---------- Schedule edit / delete (routes to AI chat as Stage 2 CTA pattern) ----------
  const editSchedule = (s) => {
    lifeos.sendAiMessage(`Edit schedule "${s.label}" (${s.time}, ${s.days}).`, { source: "lights" });
    toasts.info(`Editing "${s.label}" — I'll surface this in your AI chat shortly.`);
    announcement = `Editing ${s.label}`;
  };
  const deleteSchedule = (s) => {
    lifeos.sendAiMessage(`Delete schedule "${s.label}" (${s.time}, ${s.days}).`, { source: "lights" });
    toasts.warn(`Deleting "${s.label}" — I'll surface this in your AI chat shortly.`);
    announcement = `Deleting ${s.label}`;
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
    overrides,
    brightness: brightnessOverrides,
    activeSceneId,
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
        if (parsed.overrides && typeof parsed.overrides === "object") overrides = { ...parsed.overrides };
        if (parsed.brightness && typeof parsed.brightness === "object") brightnessOverrides = { ...parsed.brightness };
        if (typeof parsed.activeSceneId === "string" && parsed.activeSceneId) activeSceneId = parsed.activeSceneId;
      }
    } catch { /* fresh slate is fine */ }
  };

  onMount(() => { hydrateFromTauri(); });
  onDestroy(() => {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; flushPersist(); }
  });
</script>

<div class="canvas lights-canvas" role="region" aria-label="Home lighting">
  <div class="sr-only" role="status" aria-live="polite">{announcement}</div>
  {#if !lighting.rooms.length}
    <div class="sub-empty">
      <Icon name="lamp" size={20} />
      <p>No rooms wired yet. Ask LifeOS to set up your home lighting.</p>
    </div>
  {:else}
    <div class="lights-main">
      <header class="lights-head">
        <div>
          <div class="canvas-eyebrow">Home automation · Lights</div>
          <h1>Lights</h1>
          <p class="lights-summary">{activeCount} of {totalCount} on · {lighting.rooms.length} rooms</p>
        </div>
        <button class="lights-back" type="button" onclick={backToDashboard} aria-label="Back to dashboard">
          <Icon name="arrow-left" size={14} /> Dashboard
        </button>
      </header>

      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <!-- Roving tabindex (ARIA radiogroup pattern): focus lives on the child radios,
           never on the container — matching the Vue original's DOM exactly. -->
      <div class="scene-strip"
           role="radiogroup"
           aria-label="Lighting scenes"
           onkeydown={onSceneStripKeydown}>
        {#each lighting.scenes as s, idx (s.id)}
          <button bind:this={sceneRefs[idx]}
                  class="scene-btn"
                  type="button"
                  role="radio"
                  aria-checked={s.id === activeSceneId}
                  tabindex={s.id === activeSceneId ? 0 : -1}
                  style={s.id === activeSceneId ? `background: ${s.gradient};` : undefined}
                  onclick={() => pickScene(s.id)}>
            <Icon name={s.icon} size={14} /> {s.label}
          </button>
        {/each}
      </div>

      <div class="room-grid">
        {#each lighting.rooms as room (room.id)}
          <!-- svelte-ignore a11y_no_redundant_roles -->
          <!-- Explicit role="region" is asserted by the spec suite and mirrors the Vue DOM. -->
          <section class="room-card"
                   role="region"
                   aria-labelledby={`room-${room.id}-title`}>
            <div class="room-head">
              <span class="room-ico" aria-hidden="true"><Icon name={room.icon} size={16} /></span>
              <h2 id={`room-${room.id}-title`} class="room-title">{room.label}</h2>
              <span class="room-count" class:has-active={activeInRoom(room) > 0}>
                {activeInRoom(room)} on
              </span>
            </div>
            <div class="light-tiles">
              {#each room.devices as light (light.id)}
                <div class="light-tile-wrap">
                  <button class="light-tile"
                          type="button"
                          role="switch"
                          aria-checked={isLightOn(light)}
                          aria-label={`${light.label}, ${isLightOn(light) ? 'on' : 'off'}`}
                          onclick={() => toggleLight(light)}>
                    <span class="tile-head">
                      <Icon name={light.type === 'strip' ? 'minus' : light.type === 'pendant' ? 'circle' : 'lamp'} size={13} />
                      <span class="tile-meta">{isLightOn(light) ? `${lightBrightness(light)}%` : 'off'}</span>
                    </span>
                    <span class="tile-label">{light.label}</span>
                  </button>
                  {#if isLightOn(light)}
                    <input class="tile-brightness"
                           type="range"
                           min="0"
                           max="100"
                           step="1"
                           value={lightBrightness(light)}
                           aria-label={`Brightness for ${light.label}`}
                           oninput={(e) => setBrightness(light, e.target.value)}
                           onclick={(e) => e.stopPropagation()} />
                  {/if}
                </div>
              {/each}
            </div>
            {#if activeInRoom(room) > 0 && roomAverageKelvin(room) !== null}
              <div class="kelvin-meter"
                   role="group"
                   aria-label={`Average color temperature for ${room.label}`}>
                <div class="kelvin-track">
                  <span class="kelvin-marker"
                        style="left: {kelvinPercent(roomAverageKelvin(room))}%;"
                        aria-hidden="true"></span>
                </div>
                <span class="kelvin-value">{roomAverageKelvin(room)}K</span>
              </div>
            {/if}
          </section>
        {/each}
      </div>
    </div>
  {/if}

  {#if lighting.rooms.length}
    <!-- svelte-ignore a11y_no_redundant_roles -->
    <!-- Explicit role="region" mirrors the Vue DOM byte-for-byte. -->
    <section class="schedule-timeline" role="region" aria-label="Lighting schedules">
      <h3 class="schedule-head">Schedules</h3>
      <ul class="schedule-list">
        {#each lighting.schedules as s (s.id)}
          <li class="schedule-row">
            <span class="schedule-dot" aria-hidden="true"></span>
            <div class="schedule-body">
              <div class="schedule-time">{s.time}</div>
              <div class="schedule-label">{s.label}</div>
              <div class="schedule-detail">{s.days} · {s.sceneId} scene</div>
            </div>
            <div class="schedule-actions">
              <button class="schedule-action"
                      type="button"
                      aria-label={`Edit ${s.label}`}
                      onclick={() => editSchedule(s)}>
                <Icon name="pencil" size={13} />
              </button>
              <button class="schedule-action"
                      type="button"
                      aria-label={`Delete ${s.label}`}
                      onclick={() => deleteSchedule(s)}>
                <Icon name="x" size={13} />
              </button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
