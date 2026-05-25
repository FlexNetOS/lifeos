import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuth } from "@/stores/auth";

describe("auth store (fake-backend mode)", () => {
  let auth;
  beforeEach(async () => {
    setActivePinia(createPinia());
    auth = useAuth();
    auth._resetFakeBackend();
    await auth.loadStatus();
  });

  it("starts in needs_signup when no account exists", () => {
    expect(auth.status).toBe("needs_signup");
    expect(auth.hasAccount).toBe(false);
    expect(auth.isSignedIn).toBe(false);
    expect(auth.account).toBeNull();
  });

  it("signup transitions to signed_in and remembers the account", async () => {
    const ok = await auth.signup({
      email: "alex@lifeos.ai",
      displayName: "Alex",
      password: "longenough",
    });
    expect(ok).toBe(true);
    expect(auth.isSignedIn).toBe(true);
    expect(auth.status).toBe("signed_in");
    expect(auth.account.email).toBe("alex@lifeos.ai");
    expect(auth.account.displayName).toBe("Alex");
  });

  it("signup rejects short passwords without changing state", async () => {
    const ok = await auth.signup({
      email: "alex@lifeos.ai",
      displayName: "Alex",
      password: "short",
    });
    expect(ok).toBe(false);
    expect(auth.error).toMatch(/8 characters/);
    expect(auth.isSignedIn).toBe(false);
    expect(auth.hasAccount).toBe(false);
  });

  it("signup rejects malformed emails", async () => {
    const ok = await auth.signup({
      email: "not-an-email",
      displayName: "Alex",
      password: "longenough",
    });
    expect(ok).toBe(false);
    expect(auth.error).toMatch(/valid email/i);
  });

  it("signup rejects empty display name", async () => {
    const ok = await auth.signup({
      email: "alex@lifeos.ai",
      displayName: "   ",
      password: "longenough",
    });
    expect(ok).toBe(false);
    expect(auth.error).toMatch(/display name/i);
  });

  it("signin requires the same password, rejects others, succeeds with match", async () => {
    await auth.signup({ email: "a@b.c", displayName: "A", password: "longenough" });
    await auth.signout();
    expect(auth.welcomeBack).toBe(true);

    const bad = await auth.signin({ password: "wrong-password" });
    expect(bad).toBe(false);
    expect(auth.error).toMatch(/didn't match/i);
    expect(auth.isSignedIn).toBe(false);

    const good = await auth.signin({ password: "longenough" });
    expect(good).toBe(true);
    expect(auth.isSignedIn).toBe(true);
    expect(auth.error).toBeNull();
  });

  it("signout transitions to signed_out and keeps the account record", async () => {
    await auth.signup({ email: "a@b.c", displayName: "A", password: "longenough" });
    await auth.signout();
    expect(auth.status).toBe("signed_out");
    expect(auth.hasAccount).toBe(true);
    expect(auth.account.email).toBe("a@b.c");
  });

  it("resetVault wipes everything back to needs_signup", async () => {
    await auth.signup({ email: "a@b.c", displayName: "A", password: "longenough" });
    await auth.resetVault();
    expect(auth.status).toBe("needs_signup");
    expect(auth.hasAccount).toBe(false);
    expect(auth.account).toBeNull();
  });

  it("clearError nulls the error field", async () => {
    await auth.signup({ email: "x", displayName: "A", password: "short" });
    expect(auth.error).not.toBeNull();
    auth.clearError();
    expect(auth.error).toBeNull();
  });

  it("a second signup attempt against an existing account fails loudly", async () => {
    await auth.signup({ email: "a@b.c", displayName: "A", password: "longenough" });
    await auth.signout();
    const ok = await auth.signup({
      email: "other@b.c",
      displayName: "B",
      password: "longenough",
    });
    expect(ok).toBe(false);
    expect(auth.error).toMatch(/already exists/i);
  });
});
