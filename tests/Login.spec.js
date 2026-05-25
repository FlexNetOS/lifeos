import { describe, it, expect, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import Login from "@/views/Login.vue";
import { useAuth } from "@/stores/auth";

describe("Login.vue", () => {
  let pinia, auth;
  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    auth = useAuth();
    auth._resetFakeBackend();
    await auth.loadStatus();
  });

  it("renders the signup form when no account exists", () => {
    const w = mount(Login, { global: { plugins: [pinia] } });
    expect(w.text()).toContain("Welcome to LifeOS");
    expect(w.find('[data-test="login-email"]').exists()).toBe(true);
    expect(w.find('[data-test="login-name"]').exists()).toBe(true);
    expect(w.find('[data-test="login-password"]').exists()).toBe(true);
    expect(w.find('[data-test="login-password-confirm"]').exists()).toBe(true);
    expect(w.find('[data-test="login-submit"]').text()).toContain("Create account");
  });

  it("renders the welcome-back signin form when account exists, signed out", async () => {
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
    await auth.signout();

    const w = mount(Login, { global: { plugins: [pinia] } });
    expect(w.text()).toContain("Welcome back");
    expect(w.find('[data-test="login-account-email"]').text()).toBe("alex@lifeos.ai");
    expect(w.find('[data-test="login-password"]').exists()).toBe(true);
    expect(w.find('[data-test="login-email"]').exists()).toBe(false);
    expect(w.find('[data-test="login-name"]').exists()).toBe(false);
    expect(w.find('[data-test="login-submit"]').text()).toContain("Unlock");
  });

  it("submit button stays disabled until signup fields are valid + match", async () => {
    const w = mount(Login, { global: { plugins: [pinia] } });
    const btn = w.find('[data-test="login-submit"]');

    expect(btn.attributes("disabled")).toBeDefined();

    await w.find('[data-test="login-email"]').setValue("alex@lifeos.ai");
    await w.find('[data-test="login-name"]').setValue("Alex");
    await w.find('[data-test="login-password"]').setValue("longenough");
    // Still mismatched — confirm field empty
    expect(btn.attributes("disabled")).toBeDefined();

    await w.find('[data-test="login-password-confirm"]').setValue("longenough");
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("submitting the signup form signs the user in", async () => {
    const w = mount(Login, { global: { plugins: [pinia] } });
    await w.find('[data-test="login-email"]').setValue("alex@lifeos.ai");
    await w.find('[data-test="login-name"]').setValue("Alex");
    await w.find('[data-test="login-password"]').setValue("longenough");
    await w.find('[data-test="login-password-confirm"]').setValue("longenough");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(auth.isSignedIn).toBe(true);
    expect(auth.account.email).toBe("alex@lifeos.ai");
  });

  it("signin with the wrong password surfaces the error banner", async () => {
    await auth.signup({ email: "a@b.c", displayName: "A", password: "longenough" });
    await auth.signout();

    const w = mount(Login, { global: { plugins: [pinia] } });
    await w.find('[data-test="login-password"]').setValue("wrong");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(auth.isSignedIn).toBe(false);
    expect(w.find('[data-test="login-error"]').text()).toMatch(/didn't match/i);
  });

  it("typing in a field clears any stale error", async () => {
    await auth.signup({ email: "a@b.c", displayName: "A", password: "longenough" });
    await auth.signout();
    const w = mount(Login, { global: { plugins: [pinia] } });
    await w.find('[data-test="login-password"]').setValue("wrong");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(w.find('[data-test="login-error"]').exists()).toBe(true);

    await w.find('[data-test="login-password"]').setValue("");
    await w.find('[data-test="login-password"]').trigger("input");
    expect(auth.error).toBeNull();
  });

  it("reset vault from the signin screen takes the user back to signup", async () => {
    await auth.signup({ email: "a@b.c", displayName: "A", password: "longenough" });
    await auth.signout();
    const w = mount(Login, { global: { plugins: [pinia] } });
    expect(w.text()).toContain("Welcome back");

    await w.find('[data-test="login-reset"]').trigger("click");
    expect(w.find('[data-test="login-reset-confirm-panel"]').exists()).toBe(true);

    await w.find('[data-test="login-reset-confirm"]').trigger("click");
    await flushPromises();
    expect(auth.status).toBe("needs_signup");
    expect(w.text()).toContain("Welcome to LifeOS");
  });
});
