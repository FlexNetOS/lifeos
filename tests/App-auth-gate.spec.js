import { describe, it, expect, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import App from "@/App.vue";
import { useAuth } from "@/stores/auth";

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/workspace/:id?/:section?/:sub?", component: { template: "<div />" } },
      { path: "/settings/:section?/:sub?", component: { template: "<div />" } },
      { path: "/", redirect: "/workspace/ai" },
    ],
  });

describe("App auth gate", () => {
  let pinia, router, auth;
  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = makeRouter();
    await router.push("/");
    await router.isReady();
    auth = useAuth();
    auth._resetFakeBackend();
  });

  it("renders Login when no account exists (needs_signup)", async () => {
    await auth.loadStatus();
    const w = mount(App, { global: { plugins: [pinia, router] } });
    await flushPromises();
    expect(w.find(".lifeos-login").exists()).toBe(true);
    expect(w.find(".shell").exists()).toBe(false);
  });

  it("renders the shell when signed_in", async () => {
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
    const w = mount(App, { global: { plugins: [pinia, router] } });
    await flushPromises();
    expect(w.find(".shell").exists()).toBe(true);
    expect(w.find(".lifeos-login").exists()).toBe(false);
  });

  it("reverts to Login after signout", async () => {
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
    const w = mount(App, { global: { plugins: [pinia, router] } });
    await flushPromises();
    expect(w.find(".shell").exists()).toBe(true);

    await auth.signout();
    await flushPromises();
    expect(w.find(".lifeos-login").exists()).toBe(true);
    expect(w.find(".shell").exists()).toBe(false);
  });

  it("renders Login when signed_out (welcome back)", async () => {
    await auth.signup({ email: "alex@lifeos.ai", displayName: "Alex", password: "longenough" });
    await auth.signout();
    const w = mount(App, { global: { plugins: [pinia, router] } });
    await flushPromises();
    expect(w.find(".lifeos-login").exists()).toBe(true);
    expect(w.text()).toContain("Welcome back");
  });
});
