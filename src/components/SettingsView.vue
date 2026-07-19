<script setup>
// LifeOS — SettingsView SFC
// Dedicated settings canvas at /settings. Surfaces AI provider, telemetry,
// appearance placeholder, and About. Pinia is the source of truth; persistence
// is handled by the tauriPersistence plugin (no direct disk I/O here). The
// About card calls the `app_version` Tauri command on mount and falls back to
// a "Web preview" placeholder outside the desktop host.

import { onMounted, ref } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useAuth } from "@/stores/auth";
import { useToasts } from "@/stores/toasts.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();
const auth = useAuth();
const toasts = useToasts();

const resetVaultConfirm = ref(false);

const onSignOut = async () => {
  await auth.signout();
  toasts.info("Signed out of LifeOS.");
};

const onAccountReset = async () => {
  await auth.resetVault();
  resetVaultConfirm.value = false;
  toasts.success("Local vault reset — sign up to start fresh.");
};

const REFRESH_OPTIONS = [
  { ms: 1000, label: "1s" },
  { ms: 2000, label: "2s" },
  { ms: 5000, label: "5s" },
];

// Tauri detection mirrors LightsView / TelemetryWidget / lifeos store.
const tauriInvoke = () => {
  const t = (typeof window !== "undefined") ? window.__TAURI__ : null;
  return t?.core?.invoke || null;
};

const version = ref({ app: "—", tauri: "Web preview", target_triple: "Web preview" });

const onAiProviderChange = (event) => {
  const next = event?.target?.value;
  if (!next) return;
  lifeos.setAiProvider(next);
  toasts.success(`AI provider set to ${next}.`);
};

const onTelemetryToggle = (event) => {
  const enabled = !!event?.target?.checked;
  lifeos.setTelemetryEnabled(enabled);
  toasts.info(enabled ? "Live telemetry resumed." : "Live telemetry paused.");
};

const onRefreshRateChange = (ms) => {
  lifeos.setTelemetryRefreshMs(ms);
  const opt = REFRESH_OPTIONS.find((o) => o.ms === ms);
  toasts.info(`Telemetry refresh set to ${opt ? opt.label : `${ms}ms`}.`);
};

const openKeyboardHelp = () => {
  // Hand off to KeyboardHelp.vue — it owns its own ? listener on document. We
  // synthesise the same event here instead of duplicating the overlay markup.
  const ev = new KeyboardEvent("keydown", { key: "?", bubbles: true });
  document.body.dispatchEvent(ev);
};

const onResetState = () => {
  lifeos.resetUiState();
  toasts.success("LifeOS settings reset to defaults.");
};

onMounted(async () => {
  const invoke = tauriInvoke();
  if (!invoke) return;
  try {
    const v = await invoke("app_version");
    if (v && typeof v === "object") {
      version.value = {
        app: String(v.app ?? "—"),
        tauri: String(v.tauri ?? "—"),
        target_triple: String(v.target_triple ?? "—"),
      };
    }
  } catch {
    /* Stay calm — defaults already reflect "Web preview". */
  }
});
</script>

<template>
  <div class="canvas settings-canvas" role="region" aria-label="Settings">
    <div class="settings-main">
      <header class="lights-head">
        <div>
          <div class="canvas-eyebrow">App · Settings</div>
          <h1>Settings</h1>
          <p class="lights-summary">Configure how LifeOS behaves.</p>
        </div>
      </header>

      <!-- Account -->
      <section
        class="settings-section"
        role="region"
        aria-labelledby="settings-account-heading"
      >
        <div class="settings-section-head">
          <span class="settings-section-ico" aria-hidden="true">
            <Icon name="user" :size="16" />
          </span>
          <h2 id="settings-account-heading" class="settings-section-title">Account</h2>
        </div>
        <p class="settings-section-desc">
          Local vault — credentials never leave this device.
        </p>
        <dl class="settings-meta" data-test="settings-account-meta">
          <div class="settings-meta-row">
            <dt class="settings-meta-key">Display name</dt>
            <dd class="settings-meta-value" data-test="settings-account-name">
              {{ auth.account?.displayName || "—" }}
            </dd>
          </div>
          <div class="settings-meta-row">
            <dt class="settings-meta-key">Email</dt>
            <dd class="settings-meta-value" data-test="settings-account-email">
              {{ auth.account?.email || "—" }}
            </dd>
          </div>
        </dl>
        <div class="settings-account-actions">
          <button
            type="button"
            class="settings-action"
            data-test="settings-signout"
            @click="onSignOut"
          >
            Sign out
          </button>
          <button
            v-if="!resetVaultConfirm"
            type="button"
            class="settings-action settings-action--quiet"
            data-test="settings-reset-vault"
            @click="resetVaultConfirm = true"
          >
            Reset vault…
          </button>
          <template v-else>
            <button
              type="button"
              class="settings-action settings-action--danger"
              data-test="settings-reset-vault-confirm"
              @click="onAccountReset"
            >
              Confirm — wipe vault
            </button>
            <button
              type="button"
              class="settings-action settings-action--quiet"
              data-test="settings-reset-vault-cancel"
              @click="resetVaultConfirm = false"
            >
              Cancel
            </button>
          </template>
        </div>
      </section>

      <!-- AI provider -->
      <section
        class="settings-section"
        role="region"
        aria-labelledby="settings-ai-heading"
      >
        <div class="settings-section-head">
          <span class="settings-section-ico" aria-hidden="true">
            <Icon name="sparkles" :size="16" />
          </span>
          <h2 id="settings-ai-heading" class="settings-section-title">AI provider</h2>
        </div>
        <p class="settings-section-desc">
          LifeOS routes chat and Open Pencil requests through this provider.
        </p>
        <label class="settings-field">
          <span class="settings-field-label">Active provider</span>
          <select
            class="settings-select"
            :value="lifeos.aiProvider"
            aria-label="Active AI provider"
            @change="onAiProviderChange"
          >
            <option
              v-for="name in lifeos.availableAiProviders"
              :key="name"
              :value="name"
            >{{ name }}</option>
          </select>
        </label>
      </section>

      <!-- Telemetry -->
      <section
        class="settings-section"
        role="region"
        aria-labelledby="settings-telemetry-heading"
      >
        <div class="settings-section-head">
          <span class="settings-section-ico" aria-hidden="true">
            <Icon name="cpu" :size="16" />
          </span>
          <h2 id="settings-telemetry-heading" class="settings-section-title">Telemetry</h2>
        </div>
        <p class="settings-section-desc">
          Show live CPU, memory, network, and uptime on the dashboard.
        </p>
        <label class="settings-toggle-row">
          <input
            type="checkbox"
            class="settings-toggle"
            :checked="lifeos.telemetryEnabled"
            aria-label="Live system metrics"
            @change="onTelemetryToggle"
          />
          <span class="settings-field-label">Live system metrics</span>
        </label>
        <fieldset
          class="settings-radio-group"
          :disabled="!lifeos.telemetryEnabled"
          aria-label="Telemetry refresh rate"
        >
          <legend class="settings-field-label">Refresh rate</legend>
          <label
            v-for="opt in REFRESH_OPTIONS"
            :key="opt.ms"
            class="settings-radio"
          >
            <input
              type="radio"
              name="telemetry-refresh"
              :value="opt.ms"
              :checked="lifeos.telemetryRefreshMs === opt.ms"
              @change="onRefreshRateChange(opt.ms)"
            />
            <span class="settings-radio-label">{{ opt.label }}</span>
          </label>
        </fieldset>
      </section>

      <!-- Appearance -->
      <section
        class="settings-section"
        role="region"
        aria-labelledby="settings-appearance-heading"
      >
        <div class="settings-section-head">
          <span class="settings-section-ico" aria-hidden="true">
            <Icon name="palette" :size="16" />
          </span>
          <h2 id="settings-appearance-heading" class="settings-section-title">Appearance</h2>
        </div>
        <p class="settings-section-desc">
          LifeOS ships with a calm dark surface tuned for long sessions.
        </p>
        <div class="settings-swatch" aria-label="Active theme">
          <span class="settings-swatch-dot" aria-hidden="true" />
          <span class="settings-swatch-label">Dark · default</span>
        </div>
      </section>

      <!-- About -->
      <section
        class="settings-section"
        role="region"
        aria-labelledby="settings-about-heading"
      >
        <div class="settings-section-head">
          <span class="settings-section-ico" aria-hidden="true">
            <Icon name="info" :size="16" />
          </span>
          <h2 id="settings-about-heading" class="settings-section-title">About LifeOS</h2>
        </div>
        <p class="settings-section-desc">
          LifeOS is ElementArk's operating system and all-in-one application for
          Work, Personal, and Home. Its Yazelix workspace uses UDS and shared
          redb mmap state.
        </p>
        <dl class="settings-meta" data-test="settings-about-meta">
          <div class="settings-meta-row">
            <dt class="settings-meta-key">App</dt>
            <dd class="settings-meta-value">{{ version.app }}</dd>
          </div>
          <div class="settings-meta-row">
            <dt class="settings-meta-key">Tauri runtime</dt>
            <dd class="settings-meta-value">{{ version.tauri }}</dd>
          </div>
          <div class="settings-meta-row">
            <dt class="settings-meta-key">Target</dt>
            <dd class="settings-meta-value">{{ version.target_triple }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <section class="settings-side" role="region" aria-label="Settings sidebar">
      <section
        class="settings-section settings-side-card"
        role="region"
        aria-labelledby="settings-keys-heading"
      >
        <div class="settings-section-head">
          <span class="settings-section-ico" aria-hidden="true">
            <Icon name="settings" :size="16" />
          </span>
          <h2 id="settings-keys-heading" class="settings-section-title">Keyboard shortcuts</h2>
        </div>
        <p class="settings-section-desc">
          Press <kbd class="settings-kbd">?</kbd> anywhere to view the full list.
        </p>
        <button
          type="button"
          class="settings-action"
          @click="openKeyboardHelp"
        >
          Open shortcut overlay
        </button>
      </section>

      <section
        class="settings-section settings-side-card"
        role="region"
        aria-labelledby="settings-reset-heading"
      >
        <div class="settings-section-head">
          <span class="settings-section-ico" aria-hidden="true">
            <Icon name="rotate-ccw" :size="16" />
          </span>
          <h2 id="settings-reset-heading" class="settings-section-title">Reset state</h2>
        </div>
        <p class="settings-section-desc">
          Clear persisted UI state and start fresh. AI chat history is preserved.
        </p>
        <button
          type="button"
          class="settings-action settings-action--quiet"
          @click="onResetState"
        >
          Reset to defaults
        </button>
      </section>
    </section>
  </div>
</template>

<style scoped>
.settings-account-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}
.settings-action--danger {
  background: rgba(255, 77, 106, 0.12);
  border: 1px solid rgba(255, 77, 106, 0.4);
  color: #ff8a9c;
}
.settings-action--danger:hover {
  background: rgba(255, 77, 106, 0.18);
}
</style>
