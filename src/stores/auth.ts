// LifeOS — local account auth store.
//
// One `status` field drives the whole UI gate:
//   "loading"      — initial, before loadStatus() returns
//   "needs_signup" — no account on this device (first launch ever)
//   "signed_out"   — account exists but session is locked (every relaunch)
//   "signed_in"    — render the shell
//
// Inside a Tauri host every action invokes the Rust commands in
// src-tauri/src/auth.rs. In plain Vite / Vitest the store falls back to an
// in-memory fake that mirrors the Rust state machine so tests can drive the
// full flow without spinning up a backend. The fake lives at module scope so
// it survives store re-creation between tests; `_resetFakeBackend` returns it
// to a clean state in `beforeEach`.

import { defineStore } from "pinia";

export type AuthStatusName =
  | "loading"
  | "needs_signup"
  | "signed_out"
  | "signed_in";

export interface AuthAccount {
  email: string;
  displayName: string;
}

export interface AuthState {
  status: AuthStatusName;
  account: AuthAccount | null;
  error: string | null;
  hasAccount: boolean;
}

interface BackendStatus {
  has_account: boolean;
  account_email: string | null;
  account_display_name: string | null;
  is_signed_in: boolean;
}

function tauriInvoke():
  | ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>)
  | null {
  const t = typeof window !== "undefined" ? (window as any).__TAURI__ : null;
  return t?.core?.invoke || null;
}

interface FakeBackend {
  account: {
    email: string;
    displayName: string;
    password: string; // plaintext in the fake; the real backend uses Argon2id
  } | null;
  signedIn: boolean;
}

const fake: FakeBackend = { account: null, signedIn: false };

function fakeStatus(): BackendStatus {
  return {
    has_account: fake.account !== null,
    account_email: fake.account?.email ?? null,
    account_display_name: fake.account?.displayName ?? null,
    is_signed_in: fake.signedIn,
  };
}

function classify(status: BackendStatus): AuthStatusName {
  if (status.is_signed_in) return "signed_in";
  if (status.has_account) return "signed_out";
  return "needs_signup";
}

export const useAuth = defineStore("auth", {
  state: (): AuthState => ({
    status: "loading",
    account: null,
    error: null,
    hasAccount: false,
  }),
  getters: {
    isSignedIn: (s) => s.status === "signed_in",
    needsSignup: (s) => s.status === "needs_signup",
    welcomeBack: (s) => s.status === "signed_out" && s.hasAccount,
  },
  actions: {
    clearError() {
      this.error = null;
    },
    applyStatus(s: BackendStatus) {
      this.hasAccount = s.has_account;
      this.account =
        s.account_email && s.account_display_name
          ? { email: s.account_email, displayName: s.account_display_name }
          : null;
      this.status = classify(s);
    },
    async loadStatus(): Promise<void> {
      this.error = null;
      const invoke = tauriInvoke();
      try {
        const s = invoke
          ? ((await invoke("auth_status")) as BackendStatus)
          : fakeStatus();
        this.applyStatus(s);
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        // Treat a status-fetch failure as needs_signup so the UI stays responsive.
        this.status = "needs_signup";
      }
    },
    async signup(params: {
      email: string;
      displayName: string;
      password: string;
    }): Promise<boolean> {
      this.error = null;
      const invoke = tauriInvoke();
      try {
        if (invoke) {
          const s = (await invoke("auth_signup", {
            email: params.email,
            displayName: params.displayName,
            password: params.password,
          })) as BackendStatus;
          this.applyStatus(s);
        } else {
          // Mirror the Rust-side validation so the fake fails for the same reasons.
          if (
            !params.email.includes("@") ||
            !params.email.includes(".") ||
            !params.email.trim()
          ) {
            throw new Error("Enter a valid email address.");
          }
          if (!params.displayName.trim()) {
            throw new Error("Display name can't be empty.");
          }
          if (params.password.length < 8) {
            throw new Error("Password must be at least 8 characters.");
          }
          if (fake.account) {
            throw new Error("An account already exists on this device.");
          }
          fake.account = {
            email: params.email.trim(),
            displayName: params.displayName.trim(),
            password: params.password,
          };
          fake.signedIn = true;
          this.applyStatus(fakeStatus());
        }
        return true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        return false;
      }
    },
    async signin(params: { password: string }): Promise<boolean> {
      this.error = null;
      const invoke = tauriInvoke();
      try {
        if (invoke) {
          const s = (await invoke("auth_signin", {
            password: params.password,
          })) as BackendStatus;
          this.applyStatus(s);
        } else {
          if (!fake.account) {
            throw new Error("No account exists yet — create one.");
          }
          if (fake.account.password !== params.password) {
            throw new Error("Email or password didn't match.");
          }
          fake.signedIn = true;
          this.applyStatus(fakeStatus());
        }
        return true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        return false;
      }
    },
    async signout(): Promise<void> {
      this.error = null;
      const invoke = tauriInvoke();
      if (invoke) {
        await invoke("auth_signout").catch(() => {
          /* signout never fails loudly — fall through to status refresh */
        });
        try {
          this.applyStatus((await invoke("auth_status")) as BackendStatus);
        } catch {
          this.status = "signed_out";
        }
      } else {
        fake.signedIn = false;
        this.applyStatus(fakeStatus());
      }
    },
    async resetVault(): Promise<void> {
      this.error = null;
      const invoke = tauriInvoke();
      if (invoke) {
        await invoke("auth_reset_vault").catch(() => {
          /* even on failure we surface needs_signup so the user can try again */
        });
        try {
          this.applyStatus((await invoke("auth_status")) as BackendStatus);
        } catch {
          this.status = "needs_signup";
          this.account = null;
          this.hasAccount = false;
        }
      } else {
        fake.account = null;
        fake.signedIn = false;
        this.applyStatus(fakeStatus());
      }
    },
    /** Test-only: clear the in-memory fake so each spec starts fresh. */
    _resetFakeBackend() {
      fake.account = null;
      fake.signedIn = false;
    },
  },
});
