import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const packageJsonPath = resolve(repoRoot, "package.json");
const proofScriptPath = resolve(repoRoot, "scripts/verify-node-authority.mjs");
const protocolPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/NOTEBOOKLM_SOURCE_EXTRACTION_PROTOCOL.md",
);
const agentsPath = resolve(repoRoot, "AGENTS.md");
const ciPath = resolve(repoRoot, ".github/workflows/ci.yml");

const requiredPackages = {
  "@ruvector/ruvllm": "2.6.0",
  "@ruvector/rvf": "0.2.3",
  "@ruvector/sona": "0.1.7",
  "@ruvector/tiny-dancer": "0.1.22",
  agentdb: "3.0.0-alpha.17",
  ruvector: "0.2.34",
} as const;

const requiredLinuxX64NativeOptionalPackages = [
  "@ruvector/attention-linux-x64-gnu",
  "@ruvector/gnn-linux-x64-gnu",
  "@ruvector/graph-node-linux-x64-gnu",
  "@ruvector/router-linux-x64-gnu",
  "@ruvector/ruvllm-linux-x64-gnu",
  "@ruvector/rvf-node-linux-x64-gnu",
  "@ruvector/sona-linux-x64-gnu",
  "@ruvector/tiny-dancer-linux-x64-gnu",
  "ruvector-core-linux-x64-gnu",
] as const;

describe("repo-owned Node verification runtime", () => {
  test("owns verification packages in the root Bun manifest", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    expect(packageJson.scripts["verify:node-authority"]).toBe(
      "bun scripts/verify-node-authority.mjs",
    );
    expect(packageJson.scripts["test:node-authority"]).toBe(
      "bunx --no-install --bun vitest run tests/node-authority-install.spec.ts",
    );
    for (const [name, version] of Object.entries(requiredPackages)) {
      expect(packageJson.devDependencies[name]).toBe(version);
    }
    expect(packageJson.trustedDependencies).toEqual([
      "agentdb",
      "protobufjs",
    ]);
  });

  test("resolves every verification package from the real repository install", () => {
    const resolution = spawnSync(
      "bun",
      [
        "-e",
        `for (const name of ${JSON.stringify(Object.keys(requiredPackages))}) {
          const resolved = Bun.resolveSync(name, ${JSON.stringify(repoRoot)});
          if (!resolved.startsWith(${JSON.stringify(resolve(repoRoot, "node_modules"))})) {
            throw new Error(name + " resolved outside the repository: " + resolved);
          }
        }`,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(resolution.status, resolution.stderr).toBe(0);
  });

  test("uses a maintained proof script instead of a temporary package probe", () => {
    expect(existsSync(proofScriptPath)).toBe(true);
    const source = readFileSync(proofScriptPath, "utf8");

    expect(source).toContain("process.cwd()");
    expect(source).toContain("package.json");
    expect(source).toContain("bun.lock");
    expect(source).not.toContain("node-authority-probe");
  });

  test("fails closed on temporary installs and unverifiable HY3 participation", () => {
    const protocol = readFileSync(protocolPath, "utf8");

    expect(protocol).toContain("Temporary directories");
    expect(protocol).toContain("`bun add --cwd` probes");
    expect(protocol).toContain("`npm = bun` and `npx = bunx`");
    expect(protocol).toContain("red test");
    expect(protocol).toContain("OpenRouter `tencent/hy3:free`");
    expect(protocol).toContain("live authenticated generation");
    expect(protocol).toMatch(/Never silently substitute another\s+model/);
  });

  test("documents the profile-owned Bun and Bunx frontdoors", () => {
    const agents = readFileSync(agentsPath, "utf8");

    expect(agents).toContain("The Yazelix/Nix foundation");
    expect(agents).toContain("`bun` and `bunx` resolve through the profile");
    expect(agents).toContain("Use `bun` for npm-compatible package management");
    expect(agents).not.toContain("`bun` currently resolves from the legacy");
  });

  test("runs the native capability proof from the root install", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "lifeos-node-authority-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync(
        "bun",
        [proofScriptPath, `--output=${outputPath}`],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const result = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(result.install.owner).toBe(
        "LifeOS root package.json and bun.lock",
      );
      expect(result.ruvector.implementationType).toBe("native");
      expect(result.ruvector.capabilities).toEqual({
        sona: true,
        gnn: true,
        graph: true,
        router: true,
        rvf: true,
      });
      expect(result.install.platformNativeOptionalPackages.platform).toBe(
        "linux-x64-gnu",
      );
      expect(
        Object.keys(result.install.platformNativeOptionalPackages.packages).sort(),
      ).toEqual([...requiredLinuxX64NativeOptionalPackages].sort());
      for (const name of requiredLinuxX64NativeOptionalPackages) {
        const receipt =
          result.install.platformNativeOptionalPackages.packages[name];
        expect(receipt.ownerOptionalDependency).toBeDefined();
        expect(receipt.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(receipt.package_json).toBe(`node_modules/${name}/package.json`);
        expect(receipt.binary).toMatch(
          new RegExp(`^node_modules/${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}/.+\\.node$`),
        );
      }
      expect(result.rvf.selectedBackend).toBe("NodeBackend");
      expect(result.rvf.ingestResult.accepted).toBe(2);
      expect(result.sona.enabled).toBe(true);
      expect(result.agentdb.learningEnabled).toBe(true);
      expect(result.ruvllm.adapterCount).toBe(51);
      expect(result.tinyDancer.bytes).toBeGreaterThan(0);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  test("pins CI to the profile-owned Bun version", () => {
    const ci = readFileSync(ciPath, "utf8");
    expect(ci).toContain("bun-version: 1.3.14");
  });
});
