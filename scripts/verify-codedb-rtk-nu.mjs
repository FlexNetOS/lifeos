import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const rtkNuRoot = resolve(repoRoot, process.env.LIFEOS_RTK_NU_ROOT ?? "../rtk-tokenkill");
const codeDbRoot = resolve(repoRoot, process.env.LIFEOS_CODEDB_ROOT ?? "../nu_plugin");
const expectedCodeDbRevision = "1da0680f8f02f2fc065c0c941c38e7a7ff2e37da";

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

if (run("git", ["rev-parse", "HEAD"], codeDbRoot).trim() !== expectedCodeDbRevision) {
  throw new Error("nu_plugin checkout does not match the pinned live ingest implementation");
}

const ingestSource = readFileSync(resolve(codeDbRoot, "crates/codedb/src/ingest.rs"), "utf8");
for (const contract of [
  "flexnetos.rtk_nu.envelope.v1",
  "validate_rtk_nu_stream",
  "validate_rtk_nu_envelope",
  "byte_length",
  "sha256",
]) {
  if (!ingestSource.includes(contract)) throw new Error(`CodeDB ingest contract missing ${contract}`);
}

const scratch = mkdtempSync(resolve(tmpdir(), "lifeos-rtk-nu-codedb-"));
try {
  const rtk = process.env.LIFEOS_RTK_BIN ?? "/home/flexnetos/.nix-profile/bin/rtk";
  const rawJsonl = run(
    rtk,
    [
      "proxy",
      "cargo",
      "run",
      "--quiet",
      "--manifest-path",
      "Cargo.toml",
      "--bin",
      "rtk_nu",
      "--",
      "--format",
      "jsonl",
      "--",
      "printf",
      "lifeos rtk_nu codedb integration\n",
    ],
    rtkNuRoot,
  );
  const jsonlPath = resolve(scratch, "envelope.jsonl");
  const envelopePath = resolve(scratch, "parsed-envelope.json");
  const storePath = resolve(scratch, "store");
  writeFileSync(jsonlPath, rawJsonl);
  const parsed = run(
    rtk,
    [
      "proxy",
      "nu",
      "-c",
      `open --raw '${jsonlPath}' | from json --objects | to json`,
    ],
    repoRoot,
  );
  writeFileSync(envelopePath, parsed);

  const receipt = JSON.parse(
    run(
      rtk,
      [
        "proxy",
        "cargo",
        "run",
        "--quiet",
        "--manifest-path",
        "Cargo.toml",
        "-p",
        "codedb",
        "--",
        "ingest-envelope",
        "--input",
        envelopePath,
        "--format",
        "json",
        "--store",
        storePath,
      ],
      codeDbRoot,
    ),
  );
  if (receipt.schema_version !== "codedb.raw-ingest-receipt.v0") {
    throw new Error("CodeDB returned an unexpected raw-ingest receipt schema");
  }
  if (!receipt.raw_objects?.length) {
    throw new Error("CodeDB returned no canonical raw-object receipt");
  }
  if (!receipt.raw_objects.every((object) =>
    /^sha256:[0-9a-f]{64}$/.test(object.raw_object_id) &&
    Number.isInteger(object.byte_length) && object.byte_length > 0 &&
    Number.isInteger(object.frame_count) && object.frame_count > 0
  )) {
    throw new Error("CodeDB receipt omitted canonical byte identities or frame metadata");
  }
  console.log(
    `rtk_nu → codedb → redb live path verified at ${expectedCodeDbRevision}: ${receipt.raw_objects.length} raw object(s)`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
