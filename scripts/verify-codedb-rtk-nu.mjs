import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const rtkNuRoot = resolve(repoRoot, "../rtk-tokenkill");
const codeDbRoot = resolve(repoRoot, "../nu_plugin");
const expectedCodeDbRevision = "06590085eefc8712ffc09969d2b0815a036bea3f";

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
  if (!receipt.files?.length || receipt.summary?.file_count !== receipt.files.length) {
    throw new Error("CodeDB returned no complete raw-frame receipt");
  }
  if (!receipt.files.every((file) => file.blob_ref && file.sha256 && file.blake3)) {
    throw new Error("CodeDB receipt omitted canonical byte identities");
  }
  console.log(
    `rtk_nu → codedb → redb live path verified at ${expectedCodeDbRevision}: ${receipt.files.length} frame(s)`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
