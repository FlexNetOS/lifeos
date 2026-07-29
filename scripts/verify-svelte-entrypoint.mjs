// ARCHBP-R01 — prove the mounted production Glass is the Svelte target.
// Legacy Vue/Pinia siblings may remain for the browser-preview compatibility
// surface, but the Vite entrypoint and emitted production closure must not
// mount a Vue application.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const index = read("index.html");
const main = read("src/main.ts");
const app = read("src/App.svelte");
const vite = read("vite.config.ts");
const packageJson = JSON.parse(read("package.json"));

if (!index.includes('src="/src/main.ts"')) {
  throw new Error("index.html does not mount src/main.ts");
}
if (!main.includes('import { mount } from "svelte"') || !main.includes('import App from "@/App.svelte"')) {
  throw new Error("src/main.ts is not the Svelte mount entrypoint");
}
if (!main.includes("mount(App") || !app.includes("<script")) {
  throw new Error("App.svelte is not mounted by the production entrypoint");
}
if (!vite.includes('import { svelte } from "@sveltejs/vite-plugin-svelte"') || !vite.includes("plugins: [svelte()")) {
  throw new Error("Vite does not use the Svelte production plugin");
}

const compatibilityVue = ["vue", "vue-router", "pinia"];
const dependencyRoles = Object.fromEntries(
  compatibilityVue.map((name) => [name, packageJson.dependencies?.[name] ?? null]),
);
if (compatibilityVue.some((name) => !dependencyRoles[name])) {
  throw new Error("legacy preview compatibility dependencies are not declared explicitly");
}

const distAssets = existsSync(join(root, "dist/assets"))
  ? readdirSync(join(root, "dist/assets")).filter((name) => name.endsWith(".js"))
  : [];
if (distAssets.length === 0) throw new Error("dist/assets has no production JavaScript closure");
const emitted = distAssets.map((name) => readFileSync(join(root, "dist/assets", name), "utf8")).join("\n");
for (const forbidden of ["createApp(", "from\"vue\"", "from \"vue\""]) {
  if (emitted.includes(forbidden)) throw new Error(`Vue entrypoint marker found in emitted closure: ${forbidden}`);
}

const receipt = {
  schema_version: "lifeos.evidence.svelte-entrypoint.v1",
  authority: "repository entrypoint, Vite configuration, and emitted production closure",
  mounted_entry: "src/main.ts",
  mounted_component: "src/App.svelte",
  vite_plugin: "@sveltejs/vite-plugin-svelte",
  compatibility_dependencies: dependencyRoles,
  production_assets: distAssets,
  source_sha256: {
    index: sha256(index),
    main: sha256(main),
    app: sha256(app),
    vite: sha256(vite),
  },
  vue_entrypoint_markers: { createApp: false, vue_import: false },
  ok: true,
};
const receiptPath = join(root, "evidence/glass/svelte-entrypoint-receipt.json");
mkdirSync(join(root, "evidence/glass"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: receiptPath }, null, 2));
