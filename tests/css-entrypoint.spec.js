import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("CSS entrypoint", () => {
  it("loads design tokens exactly once before component and Vue-specific rules", () => {
    const main = fs.readFileSync(path.join(repoRoot, "src/main.ts"), "utf8");
    const tokensCss = fs.readFileSync(path.join(repoRoot, "colors_and_type.css"), "utf8");
    const entrypoint = fs.readFileSync(path.join(repoRoot, "styles.css"), "utf8");
    const components = fs.readFileSync(path.join(repoRoot, "lifeos_app.css"), "utf8");

    expect(entrypoint.match(/@import\s+url\([^)]*colors_and_type\.css[^)]*\)/g) ?? []).toHaveLength(0);
    expect(entrypoint.match(/@import\s+url\([^)]*lifeos_app\.css[^)]*\)/g) ?? []).toHaveLength(0);
    expect(components.match(/@import\s+url\([^)]*colors_and_type\.css[^)]*\)/g) ?? []).toHaveLength(0);
    expect(tokensCss.match(/@import\s+url\(/g) ?? []).toHaveLength(2);
    expect(tokensCss.lastIndexOf("@import")).toBeLessThan(tokensCss.indexOf("@font-face"));

    const tokens = main.indexOf('import "../colors_and_type.css"');
    const componentStyles = main.indexOf('import "../lifeos_app.css"');
    const vueStyles = main.indexOf('import "../styles.css"');
    expect(tokens).toBeGreaterThanOrEqual(0);
    expect(componentStyles).toBeGreaterThan(tokens);
    expect(vueStyles).toBeGreaterThan(componentStyles);
  });
});
