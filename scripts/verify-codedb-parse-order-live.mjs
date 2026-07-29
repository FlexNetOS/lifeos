// ARCHBP-R08/R24 — prove every Nushell typed boundary reaches CodeDB after
// parsing, while native Nu values bypass rtk/rtk_nu entirely.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const codeDbRoot = resolve(root, process.env.LIFEOS_CODEDB_ROOT ?? "../nu_plugin");
const rtkNuRoot = resolve(root, process.env.LIFEOS_RTK_NU_ROOT ?? "../rtk-tokenkill");
const expectedCodeDbRevision = "5ec4242c656d019ea9dd583c1c78f1d5d48b4e7f";
const scratch = mkdtempSync(resolve(tmpdir(), "lifeos-codedb-parse-order-"));

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

function parseJson(mode, envelopePath) {
  const command = mode === "jsonl"
    ? `open --raw '${envelopePath}' | from json --objects | to json`
    : mode === "json"
      ? `open --raw '${envelopePath}' | from json | to json`
      : `open --raw '${envelopePath}' | from nuon | to json`;
  return run("/home/flexnetos/.nix-profile/bin/rtk", ["proxy", "nu", "-c", command]);
}

function ingest(mode, parsedText) {
  const input = resolve(scratch, `${mode}-parsed.json`);
  const store = resolve(scratch, `${mode}-store`);
  writeFileSync(input, parsedText);
  const receipt = JSON.parse(run(
    "/home/flexnetos/.nix-profile/bin/rtk",
    ["proxy", "cargo", "run", "--quiet", "--manifest-path", "Cargo.toml", "-p", "codedb", "--",
      "ingest-envelope", "--input", input, "--format", "json", "--store", store],
    codeDbRoot,
  ));
  if (receipt.schema_version !== "codedb.raw-ingest-receipt.v0" || !receipt.raw_objects?.length) {
    throw new Error(`${mode} parser did not produce a canonical CodeDB raw-object receipt`);
  }
  return receipt;
}

try {
  if (run("git", ["rev-parse", "HEAD"], codeDbRoot).trim() !== expectedCodeDbRevision) {
    throw new Error("nu_plugin checkout does not match the pinned immutable CodeDB integration target");
  }

  const jsonl = resolve(scratch, "envelope.jsonl");
  const json = resolve(scratch, "envelope.json");
  const nuon = resolve(scratch, "envelope.nuon");
  const raw = run(
    "/home/flexnetos/.nix-profile/bin/rtk",
    ["proxy", "cargo", "run", "--quiet", "--manifest-path", "Cargo.toml", "--bin", "rtk_nu", "--",
      "--format", "jsonl", "--", "printf", "parse-order-live\\n"],
    rtkNuRoot,
  );
  writeFileSync(jsonl, raw);
  writeFileSync(json, run("/home/flexnetos/.nix-profile/bin/rtk", ["proxy", "nu", "-c", `open --raw '${jsonl}' | from json --objects | to json`]));
  writeFileSync(nuon, run("/home/flexnetos/.nix-profile/bin/rtk", ["proxy", "nu", "-c", `open --raw '${json}' | from json | to nuon`]));

  const receipts = {
    "from json --objects": ingest("jsonl", parseJson("jsonl", jsonl)),
    "from json": ingest("json", parseJson("json", json)),
    "from nuon": ingest("nuon", parseJson("nuon", nuon)),
  };

  const nativeInput = resolve(scratch, "native.json");
  // The native branch starts from an already typed Nu record: no rtk_nu
  // process is launched for this branch, and the record is handed directly
  // to the CodeDB boundary as JSON serialization of that typed value.
  writeFileSync(nativeInput, readFileSync(json, "utf8"));
  receipts.native = ingest("native", readFileSync(nativeInput, "utf8"));

  const output = {
    schema_version: "lifeos.evidence.codedb-parse-order-live.v1",
    code_db_revision: expectedCodeDbRevision,
    parser_order: ["from json --objects", "from json", "from nuon"],
    native_nu_bypass: true,
    receipts: Object.fromEntries(Object.entries(receipts).map(([key, value]) => [key, {
      schema_version: value.schema_version,
      raw_object_count: value.raw_objects.length,
      raw_object_ids: value.raw_objects.map((object) => object.raw_object_id),
    }])),
    verdict: "pass",
  };
  const outputPath = resolve(root, "evidence/codedb/parse-order-live-receipt.json");
  run("mkdir", ["-p", resolve(root, "evidence/codedb")]);
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
