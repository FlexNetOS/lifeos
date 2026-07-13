import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Vite 8 build configuration", () => {
  it("uses Rolldown codeSplitting without the deprecated advancedChunks key", () => {
    const config = fs.readFileSync(path.join(process.cwd(), "vite.config.ts"), "utf8");

    expect(config).toMatch(/\bcodeSplitting\s*:/);
    expect(config).not.toMatch(/\badvancedChunks\b/);
  });
});
