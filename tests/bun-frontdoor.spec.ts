import { realpathSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const packageJsonPath = join(repoRoot, "package.json");
const profileBin = join(homedir(), ".nix-profile", "bin");

describe("profile-owned Bun frontdoors", () => {
  test("pins the repository package manager to Bun 1.3.14", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    expect(packageJson.packageManager).toBe("bun@1.3.14");
  });

  test("resolves explicit profile Bun and Bunx frontdoors into the Nix store", () => {
    expect(realpathSync(join(profileBin, "bun"))).toMatch(
      /^\/nix\/store\/.+\/bin\/bun$/,
    );
    expect(realpathSync(join(profileBin, "bunx"))).toMatch(
      /^\/nix\/store\/.+\/bin\/bun$/,
    );
  });
});
