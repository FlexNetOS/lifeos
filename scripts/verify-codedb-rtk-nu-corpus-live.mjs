// ARCHBP-R12 — prove the byte-equality corpus through rtk_nu, Nu parsing,
// CodeDB validation, and the redb raw-object store.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const codeDbRoot = resolve(root, process.env.LIFEOS_CODEDB_ROOT ?? "../nu_plugin");
const rtkNuRoot = resolve(root, process.env.LIFEOS_RTK_NU_ROOT ?? "../rtk-tokenkill");
const codeDbRevision = "5ec4242c656d019ea9dd583c1c78f1d5d48b4e7f";
const rtkNuRevision = "eee0dfbd3cf3dc82f5604c77ccc4f93c4a5f0c45";
const scratch = mkdtempSync(resolve(tmpdir(), "lifeos-codedb-rtk-nu-corpus-"));

const cases = [
  {
    name: "binary-failure-partial",
    args: ["sh", "-c", 'printf "\\377\\000partial"; printf "stderr" >&2; exit 7'],
    expect: (completion, frames) => {
      if (completion?.exit?.code !== 7 || completion?.exit?.success !== false) {
        throw new Error("binary-failure case did not preserve exit code 7");
      }
      if (!frames.some((frame) => Buffer.from(frame.payload_base64, "base64").includes(0xff))) {
        throw new Error("binary-failure case lost binary byte");
      }
      if (frames.some((frame) => Buffer.from(frame.payload_base64, "base64").includes(0x0a))) {
        throw new Error("binary-failure case unexpectedly normalized partial bytes");
      }
    },
  },
  {
    name: "signal",
    args: ["sh", "-c", 'printf "signal-partial"; kill -TERM $$'],
    expect: (completion) => {
      if (completion?.exit?.signal !== 15 || completion?.exit?.success !== false) {
        throw new Error(`signal case did not preserve SIGTERM: ${JSON.stringify(completion?.exit)}`);
      }
    },
  },
  {
    name: "interleaved",
    args: ["sh", "-c", 'printf "out-one"; printf "err-one" >&2; sleep 0.02; printf "out-two"; printf "err-two" >&2'],
    expect: (_completion, frames) => {
      const streams = frames.map((frame) => frame.stream);
      if (!streams.includes("stdout") || !streams.includes("stderr")) {
        throw new Error("interleaved case did not retain both streams");
      }
      if (!streams.some((stream, index) => index > 0 && stream !== streams[index - 1])) {
        throw new Error("interleaved case did not retain ordered stream transitions");
      }
    },
  },
  {
    name: "success-partial",
    args: ["sh", "-c", 'printf "success-without-newline"'],
    expect: (completion, frames) => {
      if (completion?.exit?.code !== 0 || completion?.exit?.success !== true) {
        throw new Error("success case did not retain successful completion");
      }
      if (frames.some((frame) => Buffer.from(frame.payload_base64, "base64").includes(0x0a))) {
        throw new Error("success partial-line bytes were normalized");
      }
    },
  },
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runAdapter(args) {
  const result = spawnSync(
    rtk,
    ["proxy", "cargo", "run", "--quiet", "--manifest-path", "Cargo.toml", "--bin", "rtk_nu", "--", "--format", "jsonl", "--", ...args],
    { cwd: rtkNuRoot, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  // rtk_nu mirrors a non-zero child exit while retaining the complete
  // execution envelope. The corpus deliberately includes those exits.
  if (result.status !== 0 && !result.stdout.trim()) {
    throw new Error(`rtk_nu ${args.join(" ")} exited ${result.status}\n${result.stderr}`);
  }
  return result.stdout;
}

function parseWithNu(inputPath) {
  return run(rtk, ["proxy", "nu", "-c", `open --raw '${inputPath}' | from json --objects | to json`], root);
}

function ingest(parsedPath, storePath) {
  return JSON.parse(run(
    rtk,
    ["proxy", "cargo", "run", "--quiet", "--manifest-path", "Cargo.toml", "-p", "codedb", "--", "ingest-envelope", "--input", parsedPath, "--format", "json", "--store", storePath],
    codeDbRoot,
  ));
}

try {
  if (run("git", ["rev-parse", "HEAD"], codeDbRoot).trim() !== codeDbRevision) {
    throw new Error("nu_plugin checkout does not match the pinned immutable CodeDB target");
  }
  if (run("git", ["rev-parse", "HEAD"], rtkNuRoot).trim() !== rtkNuRevision) {
    throw new Error("rtk-tokenkill checkout does not match the pinned immutable rtk_nu target");
  }

  const results = {};
  for (const testCase of cases) {
    const rawPath = join(scratch, `${testCase.name}.jsonl`);
    const parsedPath = join(scratch, `${testCase.name}.json`);
    const storePath = join(scratch, `${testCase.name}.redb`);
    const raw = runAdapter(testCase.args);
    writeFileSync(rawPath, raw);
    const records = raw.trim().split("\n").map((line) => JSON.parse(line));
    const frames = records.filter((record) => record.event_type === "raw_frame").map((record) => record.frame);
    const completion = records.find((record) => record.event_type === "execution_complete");
    if (!frames.length || !completion) throw new Error(`${testCase.name} did not emit frames and completion`);
    testCase.expect(completion, frames);

    const parsed = parseWithNu(rawPath);
    writeFileSync(parsedPath, parsed);
    const receipt = ingest(parsedPath, storePath);
    if (receipt.schema_version !== "codedb.raw-ingest-receipt.v0" || receipt.raw_objects?.length !== new Set(frames.map((frame) => frame.stream)).size) {
      throw new Error(`${testCase.name} receipt does not preserve the stream set`);
    }
    const expectedStreams = new Map();
    for (const frame of frames) {
      const stream = expectedStreams.get(frame.stream) ?? { chunks: [], frame_count: 0 };
      stream.chunks.push(Buffer.from(frame.payload_base64, "base64"));
      stream.frame_count += 1;
      expectedStreams.set(frame.stream, stream);
    }
    for (const [streamName, expected] of expectedStreams) {
      const bytes = Buffer.concat(expected.chunks);
      const object = receipt.raw_objects.find((candidate) => candidate.stream === streamName);
      if (!object || object.raw_object_id !== `sha256:${sha256(bytes)}` || object.byte_length !== bytes.length || object.frame_count !== expected.frame_count) {
        throw new Error(`${testCase.name} ${streamName} bytes changed across CodeDB ingestion`);
      }
    }
    results[testCase.name] = {
      frame_count: frames.length,
      raw_bytes: frames.reduce((total, frame) => total + frame.byte_length, 0),
      streams: [...new Set(frames.map((frame) => frame.stream))],
      exit: completion.exit,
      raw_object_ids: receipt.raw_objects.map((object) => object.raw_object_id),
    };
  }

  const receipt = {
    schema_version: "lifeos.evidence.codedb-rtk-nu-corpus-live.v1",
    code_db_revision: codeDbRevision,
    rtk_nu_revision: rtkNuRevision,
    corpus: Object.keys(results),
    cases: results,
    protected_checkout_mutated: false,
    verdict: "pass",
  };
  const outputPath = resolve(root, "evidence/codedb/rtk-nu-corpus-live-receipt.json");
  mkdirSync(resolve(root, "evidence/codedb"), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
