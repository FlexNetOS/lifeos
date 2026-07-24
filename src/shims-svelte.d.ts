// LifeOS — TypeScript shims for the Svelte Glass shell (successor of the
// retired shims-vue.d.ts). Lets svelte-check/tsc resolve .svelte component
// imports and the side-effect CSS imports in src/main.ts.

declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component<Record<string, any>>;
  export default component;
}

declare module "*.css";
