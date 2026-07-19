<script setup>
// LifeOS — Login view.
// Renders all three pre-shell states from one component so the App.vue gate
// can stay one line: mount Login when status !== "signed_in".
//
//   needs_signup → email + display name + password ("Create account")
//   signed_out   → password only with the stored email shown ("Welcome back")
//   loading      → minimal centred copy (no flash of unstyled form)
//
// Pulls everything through the auth pinia store — no direct Tauri calls.

import { ref, computed } from "vue";
import { useAuth } from "@/stores/auth";
import Icon from "@/components/Icon.vue";

const auth = useAuth();

const email = ref("");
const displayName = ref("");
const password = ref("");
const passwordConfirm = ref("");
const submitting = ref(false);
const showResetConfirm = ref(false);

const isSignup = computed(() => auth.status === "needs_signup");
const isSignin = computed(() => auth.status === "signed_out");
const isLoading = computed(() => auth.status === "loading");

const passwordMismatch = computed(
  () =>
    isSignup.value &&
    passwordConfirm.value.length > 0 &&
    password.value !== passwordConfirm.value,
);

const canSubmit = computed(() => {
  if (submitting.value) return false;
  if (isSignup.value) {
    return (
      email.value.trim().length > 0 &&
      displayName.value.trim().length > 0 &&
      password.value.length >= 8 &&
      password.value === passwordConfirm.value
    );
  }
  if (isSignin.value) {
    return password.value.length > 0;
  }
  return false;
});

function onInput() {
  if (auth.error) auth.clearError();
}

async function onSubmit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    if (isSignup.value) {
      await auth.signup({
        email: email.value.trim(),
        displayName: displayName.value.trim(),
        password: password.value,
      });
    } else if (isSignin.value) {
      await auth.signin({ password: password.value });
    }
    // Wipe in-memory copies even on failure so the next attempt re-enters them.
    password.value = "";
    passwordConfirm.value = "";
  } finally {
    submitting.value = false;
  }
}

async function onResetVault() {
  await auth.resetVault();
  email.value = "";
  displayName.value = "";
  password.value = "";
  passwordConfirm.value = "";
  showResetConfirm.value = false;
}
</script>

<template>
  <div class="lifeos-login" role="dialog" aria-modal="true" aria-labelledby="login-title">
    <div v-if="isLoading" class="login-loading" aria-live="polite">
      <img src="/lifeos-mark-256.png" alt="" />
      <span class="login-loading-wordmark">LIFEOS</span>
      <small>by ElementArk · Preparing your local vault</small>
    </div>

    <form v-else class="login-card" novalidate @submit.prevent="onSubmit">
      <header class="login-head">
        <div class="login-lockup" aria-label="LifeOS by ElementArk">
          <img class="login-mark" src="/lifeos-mark-256.png" alt="" />
          <span class="login-brand-copy">
            <span class="login-wordmark">LIFEOS</span>
            <span class="login-endorsement">by ElementArk</span>
          </span>
        </div>
        <h1 id="login-title" class="login-title">
          {{ isSignup ? "Create your LifeOS account" : "Welcome back" }}
        </h1>
        <p class="login-sub">
          <template v-if="isSignup">
            Set up your local LifeOS vault. Credentials stay on this device — no network calls.
          </template>
          <template v-else>
            <strong data-test="login-account-email">{{ auth.account?.email }}</strong>
            <br />
            Enter your password to unlock LifeOS.
          </template>
        </p>
      </header>

      <p v-if="auth.error" class="login-error" role="alert" data-test="login-error">
        {{ auth.error }}
      </p>

      <fieldset class="login-fields" :disabled="submitting">
        <template v-if="isSignup">
          <label class="login-field">
            <span class="login-label">Email</span>
            <input
              v-model="email"
              type="email"
              autocomplete="email"
              required
              placeholder="you@example.com"
              class="login-input"
              data-test="login-email"
              @input="onInput"
            />
          </label>

          <label class="login-field">
            <span class="login-label">Display name</span>
            <input
              v-model="displayName"
              type="text"
              autocomplete="name"
              required
              placeholder="Alex"
              class="login-input"
              data-test="login-name"
              @input="onInput"
            />
          </label>

          <label class="login-field">
            <span class="login-label">Password</span>
            <input
              v-model="password"
              type="password"
              autocomplete="new-password"
              required
              minlength="8"
              placeholder="At least 8 characters"
              class="login-input"
              data-test="login-password"
              @input="onInput"
            />
          </label>

          <label class="login-field">
            <span class="login-label">Confirm password</span>
            <input
              v-model="passwordConfirm"
              type="password"
              autocomplete="new-password"
              required
              placeholder="Re-enter your password"
              class="login-input"
              data-test="login-password-confirm"
              @input="onInput"
            />
            <span v-if="passwordMismatch" class="login-hint login-hint--err">
              Passwords don't match yet.
            </span>
          </label>
        </template>

        <template v-else-if="isSignin">
          <label class="login-field">
            <span class="login-label">Password</span>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              placeholder="Your vault password"
              class="login-input"
              data-test="login-password"
              @input="onInput"
            />
          </label>
        </template>
      </fieldset>

      <button
        type="submit"
        class="login-submit"
        :disabled="!canSubmit"
        data-test="login-submit"
      >
        <Icon :name="isSignup ? 'user-plus' : 'log-in'" :size="16" />
        <span>{{ isSignup ? "Create account" : "Unlock" }}</span>
      </button>

      <footer class="login-foot">
        <details v-if="!showResetConfirm" class="login-details">
          <summary class="login-summary">
            {{ isSignin ? "Forgot password? Use a different account?" : "Need to start over?" }}
          </summary>
          <div class="login-reset">
            <p>
              LifeOS can't recover your password — it's never sent off this
              device. Resetting wipes the account and any locally-stored data.
            </p>
            <button
              type="button"
              class="login-danger"
              data-test="login-reset"
              @click="showResetConfirm = true"
            >
              <Icon name="refresh-cw" :size="14" />
              <span>Reset vault permanently</span>
            </button>
          </div>
        </details>

        <div v-if="showResetConfirm" class="login-reset" data-test="login-reset-confirm-panel">
          <p>Reset the vault and start over with a new account?</p>
          <div class="login-reset-actions">
            <button
              type="button"
              class="login-danger"
              data-test="login-reset-confirm"
              @click="onResetVault"
            >
              <Icon name="refresh-cw" :size="14" />
              <span>Reset &amp; start over</span>
            </button>
            <button
              type="button"
              class="login-link"
              data-test="login-reset-cancel"
              @click="showResetConfirm = false"
            >
              Cancel
            </button>
          </div>
        </div>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.lifeos-login {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  background: var(--bg-0);
  padding: 24px;
  font-family: "Lexend", system-ui, sans-serif;
  color: var(--fg-1);
}

.login-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--fg-3);
  font-size: 14px;
}

.login-loading img {
  width: 56px;
  height: 56px;
  object-fit: contain;
}

.login-loading-wordmark {
  font-family: var(--font-display);
  color: var(--fg-0);
  font-size: 28px;
  line-height: 1;
}

.login-loading small {
  color: var(--fg-3);
  font-size: 12px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-2);
  border: 1px solid var(--bg-4);
  border-radius: 16px;
  padding: 28px 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}

.login-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.login-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login-mark {
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex: 0 0 auto;
}

.login-brand-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.login-wordmark {
  font-family: var(--font-display);
  color: var(--fg-0);
  font-size: 30px;
  line-height: 1;
}

.login-endorsement {
  color: var(--fg-3);
  font-size: 11px;
  line-height: 1.2;
}

.login-title {
  font-family: inherit;
  font-weight: 600;
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: var(--fg-0);
  margin: 0;
}

.login-sub {
  margin: 0;
  color: var(--fg-3);
  font-size: 13px;
  line-height: 1.5;
}

.login-sub strong {
  color: var(--fg-1);
  font-weight: 500;
}

.login-error {
  margin: 0;
  padding: 10px 12px;
  background: rgba(255, 77, 106, 0.12);
  border: 1px solid rgba(255, 77, 106, 0.4);
  border-radius: 10px;
  color: #ff8a9c;
  font-size: 13px;
  line-height: 1.4;
}

.login-fields {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.login-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--fg-2);
  letter-spacing: 0.01em;
}

.login-input {
  background: var(--bg-3);
  border: 1px solid var(--bg-4);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--fg-1);
  font-family: inherit;
  transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}

.login-input:focus {
  outline: none;
  border-color: var(--lifeos-cyan);
  background: var(--bg-2);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.15);
}

.login-input::placeholder {
  color: var(--fg-4);
}

.login-hint {
  font-size: 12px;
  color: var(--fg-3);
}

.login-hint--err {
  color: #ff8a9c;
}

.login-submit {
  margin-top: 4px;
  background: linear-gradient(135deg, var(--lifeos-cyan), var(--lifeos-purple), var(--lifeos-green));
  border: 0;
  border-radius: 10px;
  padding: 11px 14px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--bg-0);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 80ms ease, opacity 120ms ease, box-shadow 120ms ease;
  box-shadow: 0 8px 24px rgba(0, 212, 255, 0.2);
}

.login-submit:hover:enabled {
  transform: translateY(-1px);
  box-shadow: 0 12px 32px rgba(0, 212, 255, 0.3);
}

.login-submit:active:enabled {
  transform: translateY(0);
}

.login-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.login-foot {
  border-top: 1px solid var(--bg-3);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.login-link {
  background: transparent;
  border: 0;
  color: var(--lifeos-cyan);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 4px 0;
  cursor: pointer;
  align-self: flex-start;
  text-align: left;
}

.login-link:hover {
  color: var(--lifeos-cyan-hi);
}

.login-details {
  font-size: 13px;
  color: var(--fg-3);
}

.login-summary {
  list-style: none;
  cursor: pointer;
  color: var(--fg-3);
  padding: 4px 0;
}

.login-summary:hover {
  color: var(--fg-1);
}

.login-summary::-webkit-details-marker {
  display: none;
}

.login-reset {
  margin-top: 10px;
  padding: 12px;
  background: var(--bg-3);
  border: 1px solid var(--bg-4);
  border-radius: 10px;
  color: var(--fg-2);
  font-size: 12px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.login-reset p {
  margin: 0;
}

.login-reset-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.login-danger {
  background: rgba(255, 77, 106, 0.12);
  border: 1px solid rgba(255, 77, 106, 0.4);
  border-radius: 8px;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: #ff8a9c;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background 120ms ease;
}

.login-danger:hover {
  background: rgba(255, 77, 106, 0.18);
}
</style>
