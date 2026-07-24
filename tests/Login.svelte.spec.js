// Svelte counterpart of tests/Login.spec.js — same assertions against Login.svelte.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import { createPinia, setActivePinia } from "pinia";
import Login from "@/views/Login.svelte";
import { useAuth } from "@/stores/auth";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const setValue = async (el, value) => {
  el.value = value;
  await fireEvent.input(el);
};

describe("Login.svelte", () => {
  let pinia, auth;
  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    auth = useAuth();
    auth._resetFakeBackend();
    await auth.loadStatus();
  });

  afterEach(() => cleanup());

  it("renders the signup form when no account exists", () => {
    const { container } = render(Login);
    expect(container.textContent).toContain("Welcome to LifeOS");
    expect(container.querySelector('[data-test="login-email"]')).not.toBeNull();
    expect(container.querySelector('[data-test="login-name"]')).not.toBeNull();
    expect(container.querySelector('[data-test="login-password"]')).not.toBeNull();
    expect(container.querySelector('[data-test="login-password-confirm"]')).not.toBeNull();
    expect(container.querySelector('[data-test="login-submit"]').textContent).toContain("Create account");
  });

  it("renders the welcome-back signin form when account exists, signed out", async () => {
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
    await auth.signout();

    const { container } = render(Login);
    expect(container.textContent).toContain("Welcome back");
    expect(container.querySelector('[data-test="login-account-email"]').textContent).toBe("alex@lifeos.ai");
    expect(container.querySelector('[data-test="login-password"]')).not.toBeNull();
    expect(container.querySelector('[data-test="login-email"]')).toBeNull();
    expect(container.querySelector('[data-test="login-name"]')).toBeNull();
    expect(container.querySelector('[data-test="login-submit"]').textContent).toContain("Unlock");
  });

  it("submit button stays disabled until signup fields are valid + match", async () => {
    const { container } = render(Login);
    const btn = container.querySelector('[data-test="login-submit"]');

    expect(btn.hasAttribute("disabled")).toBe(true);

    await setValue(container.querySelector('[data-test="login-email"]'), "alex@lifeos.ai");
    await setValue(container.querySelector('[data-test="login-name"]'), "Alex");
    await setValue(container.querySelector('[data-test="login-password"]'), "longenough");
    // Still mismatched — confirm field empty
    expect(btn.hasAttribute("disabled")).toBe(true);

    await setValue(container.querySelector('[data-test="login-password-confirm"]'), "longenough");
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("submitting the signup form signs the user in", async () => {
    const { container } = render(Login);
    await setValue(container.querySelector('[data-test="login-email"]'), "alex@lifeos.ai");
    await setValue(container.querySelector('[data-test="login-name"]'), "Alex");
    await setValue(container.querySelector('[data-test="login-password"]'), "longenough");
    await setValue(container.querySelector('[data-test="login-password-confirm"]'), "longenough");
    await fireEvent.submit(container.querySelector("form"));
    await flushPromises();
    expect(auth.isSignedIn).toBe(true);
    expect(auth.account.email).toBe("alex@lifeos.ai");
  });

  it("signin with the wrong password surfaces the error banner", async () => {
    await auth.signup({ email: "a@b.c", displayName: "A", password: "longenough" });
    await auth.signout();

    const { container } = render(Login);
    await setValue(container.querySelector('[data-test="login-password"]'), "wrong");
    await fireEvent.submit(container.querySelector("form"));
    await flushPromises();
    await tick();
    expect(auth.isSignedIn).toBe(false);
    expect(container.querySelector('[data-test="login-error"]').textContent).toMatch(/didn't match/i);
  });

  it("typing in a field clears any stale error", async () => {
    await auth.signup({ email: "a@b.c", displayName: "A", password: "longenough" });
    await auth.signout();
    const { container } = render(Login);
    await setValue(container.querySelector('[data-test="login-password"]'), "wrong");
    await fireEvent.submit(container.querySelector("form"));
    await flushPromises();
    await tick();
    expect(container.querySelector('[data-test="login-error"]')).not.toBeNull();

    await setValue(container.querySelector('[data-test="login-password"]'), "");
    expect(auth.error).toBeNull();
  });

  it("reset vault from the signin screen takes the user back to signup", async () => {
    await auth.signup({ email: "a@b.c", displayName: "A", password: "longenough" });
    await auth.signout();
    const { container } = render(Login);
    expect(container.textContent).toContain("Welcome back");

    await fireEvent.click(container.querySelector('[data-test="login-reset"]'));
    expect(container.querySelector('[data-test="login-reset-confirm-panel"]')).not.toBeNull();

    await fireEvent.click(container.querySelector('[data-test="login-reset-confirm"]'));
    await flushPromises();
    await tick();
    expect(auth.status).toBe("needs_signup");
    expect(container.textContent).toContain("Welcome to LifeOS");
  });
});
