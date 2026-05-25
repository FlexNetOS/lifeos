// Tell TypeScript that *.vue imports resolve to Vue components.
// vue-tsc walks .vue files for actual type-checking; this shim is for non-.vue
// consumers (main.ts, router) so they can import .vue files without `any` errors.

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

declare module "*.css";
