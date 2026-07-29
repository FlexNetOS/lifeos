// LifeOS — native Svelte-compatible local account auth store.

export type AuthStatusName = "loading" | "needs_signup" | "signed_out" | "signed_in";
export interface AuthAccount { email: string; displayName: string; }
export interface AuthState { status: AuthStatusName; account: AuthAccount | null; error: string | null; hasAccount: boolean; }
interface BackendStatus { has_account: boolean; account_email: string | null; account_display_name: string | null; is_signed_in: boolean; }
interface AuthSnapshot extends AuthState { isSignedIn: boolean; needsSignup: boolean; welcomeBack: boolean; }

function tauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const t = typeof window !== "undefined" ? (window as any).__TAURI__ : null;
  return t?.core?.invoke || null;
}

const fake: { account: { email: string; displayName: string; password: string } | null; signedIn: boolean } = { account: null, signedIn: false };
function fakeStatus(): BackendStatus {
  return { has_account: fake.account !== null, account_email: fake.account?.email ?? null, account_display_name: fake.account?.displayName ?? null, is_signed_in: fake.signedIn };
}
function classify(s: BackendStatus): AuthStatusName { return s.is_signed_in ? "signed_in" : s.has_account ? "signed_out" : "needs_signup"; }

type Subscriber = (snapshot: AuthSnapshot) => void;

class AuthStore {
  private state: AuthState = { status: "loading", account: null, error: null, hasAccount: false };
  private subscribers = new Set<Subscriber>();
  get status() { return this.state.status; }
  get account() { return this.state.account; }
  get error() { return this.state.error; }
  get hasAccount() { return this.state.hasAccount; }
  get isSignedIn() { return this.state.status === "signed_in"; }
  get needsSignup() { return this.state.status === "needs_signup"; }
  get welcomeBack() { return this.state.status === "signed_out" && this.state.hasAccount; }
  private snapshot(): AuthSnapshot { return { ...this.state, isSignedIn: this.isSignedIn, needsSignup: this.needsSignup, welcomeBack: this.welcomeBack }; }
  private commit(patch: Partial<AuthState>) {
    this.state = { ...this.state, ...patch };
    const snapshot = this.snapshot();
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }
  subscribe(run: Subscriber) { run(this.snapshot()); this.subscribers.add(run); return () => this.subscribers.delete(run); }
  clearError() { this.commit({ error: null }); }
  private applyStatus(s: BackendStatus) {
    this.commit({ hasAccount: s.has_account, account: s.account_email && s.account_display_name ? { email: s.account_email, displayName: s.account_display_name } : null, status: classify(s) });
  }
  async loadStatus(): Promise<void> {
    this.commit({ error: null });
    try { const invoke = tauriInvoke(); this.applyStatus(invoke ? await invoke("auth_status") as BackendStatus : fakeStatus()); }
    catch (err) { this.commit({ error: err instanceof Error ? err.message : String(err), status: "needs_signup" }); }
  }
  async signup(params: { email: string; displayName: string; password: string }): Promise<boolean> {
    this.commit({ error: null });
    try {
      const invoke = tauriInvoke();
      if (invoke) this.applyStatus(await invoke("auth_signup", { email: params.email, displayName: params.displayName, password: params.password }) as BackendStatus);
      else {
        if (!params.email.includes("@") || !params.email.includes(".") || !params.email.trim()) throw new Error("Enter a valid email address.");
        if (!params.displayName.trim()) throw new Error("Display name can't be empty.");
        if (params.password.length < 8) throw new Error("Password must be at least 8 characters.");
        if (fake.account) throw new Error("An account already exists on this device.");
        fake.account = { email: params.email.trim(), displayName: params.displayName.trim(), password: params.password }; fake.signedIn = true; this.applyStatus(fakeStatus());
      }
      return true;
    } catch (err) { this.commit({ error: err instanceof Error ? err.message : String(err) }); return false; }
  }
  async signin(params: { password: string }): Promise<boolean> {
    this.commit({ error: null });
    try {
      const invoke = tauriInvoke();
      if (invoke) this.applyStatus(await invoke("auth_signin", { password: params.password }) as BackendStatus);
      else { if (!fake.account) throw new Error("No account exists yet — create one."); if (fake.account.password !== params.password) throw new Error("Email or password didn't match."); fake.signedIn = true; this.applyStatus(fakeStatus()); }
      return true;
    } catch (err) { this.commit({ error: err instanceof Error ? err.message : String(err) }); return false; }
  }
  async signout(): Promise<void> {
    this.commit({ error: null }); const invoke = tauriInvoke();
    if (invoke) { await invoke("auth_signout").catch(() => {}); try { this.applyStatus(await invoke("auth_status") as BackendStatus); } catch { this.commit({ status: "signed_out" }); } }
    else { fake.signedIn = false; this.applyStatus(fakeStatus()); }
  }
  async resetVault(): Promise<void> {
    this.commit({ error: null }); const invoke = tauriInvoke();
    if (invoke) { await invoke("auth_reset_vault").catch(() => {}); try { this.applyStatus(await invoke("auth_status") as BackendStatus); } catch { this.commit({ status: "needs_signup", account: null, hasAccount: false }); } }
    else { fake.account = null; fake.signedIn = false; this.applyStatus(fakeStatus()); }
  }
  _resetFakeBackend() { fake.account = null; fake.signedIn = false; }
}

const auth = new AuthStore();
export function useAuth(): AuthStore { return auth; }
