import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const pin = readFileSync(resolve(repoRoot, "integrations/rtk_nu.toml"), "utf8");
const adapterRoot = resolve(
  repoRoot,
  process.env.LIFEOS_RTK_NU_ROOT ?? "../rtk-tokenkill",
);

const required = (name, pattern) => {
  if (!pattern.test(pin)) throw new Error(`rtk_nu pin is missing ${name}`);
};

required("schema version", /schema_version = "flexnetos\.rtk_nu\.envelope\.v1"/);
required("revision", /revision = "e446998cafe1c20eb23a371f65e6f5c3ed6f16fa"/);
required("binary", /binary = "rtk_nu"/);
required("fixture", /fixture_test = "tests\/rtk_nu_envelope_test\.rs"/);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: adapterRoot,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout.trim();
};

const revision = run("git", ["rev-parse", "HEAD"]);
if (revision !== "e446998cafe1c20eb23a371f65e6f5c3ed6f16fa") {
  throw new Error(`rtk_n checkout is ${revision}, expected the pinned revision`);
}
if (run("git", ["status", "--porcelain"])) {
  throw new Error("rtk_n source checkout is dirty; refusing an un-witnessed build");
}

const manifest = readFileSync(resolve(adapterRoot, "Cargo.toml"), "utf8");
if (!/name = "rtk_nu"[\s\S]*path = "src\/rtk_nu_main\.rs"/.test(manifest)) {
  throw new Error("Cargo.toml does not declare the pinned rtk_nu binary");
}
const source = readFileSync(resolve(adapterRoot, "src/rtk_nu_main.rs"), "utf8");
if (!source.includes('"flexnetos.rtk_nu.envelope.v1"')) {
  throw new Error("rtk_nu source does not emit the pinned envelope schema");
}

const rtk = process.env.LIFEOS_RTK_BIN ?? "/home/flexnetos/.nix-profile/bin/rtk";
const test = spawnSync(
  rtk,
  ["proxy", "cargo", "test", "--manifest-path", "Cargo.toml", "--test", "rtk_nu_envelope_test"],
  { cwd: adapterRoot, encoding: "utf8", stdio: "inherit" },
);
if (test.error) throw test.error;
if (test.status !== 0) process.exit(test.status ?? 1);

console.log(`rtk_nu ${revision} verified: schema, pin, clean source, and envelope tests`);
