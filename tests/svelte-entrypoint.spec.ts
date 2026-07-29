import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const receiptPath = "evidence/glass/svelte-entrypoint-receipt.json";

describe("ARCHBP-R01 Svelte production entrypoint", () => {
  test("records the mounted Svelte closure and compatibility boundary", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.svelte-entrypoint.v1");
    expect(receipt.mounted_entry).toBe("src/main.ts");
    expect(receipt.mounted_component).toBe("src/App.svelte");
    expect(receipt.vite_plugin).toBe("@sveltejs/vite-plugin-svelte");
    expect(receipt.vue_entrypoint_markers).toEqual({ createApp: false, vue_import: false });
    expect(receipt.compatibility_dependencies).toEqual({
      vue: "^3.5.34",
      "vue-router": "^5.0.7",
      pinia: "^3.0.4",
    });
    expect(receipt.ok).toBe(true);
  });
});
