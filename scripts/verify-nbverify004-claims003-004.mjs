import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const evidencePath = join(
  root,
  "evidence",
  "nbverify",
  "NBVERIFY-004.local-evidence.json",
);
const matrixPath = join(
  root,
  "evidence",
  "nbverify",
  "NBVERIFY-004.truth-matrix.csv",
);
const enginePath = join(root, "evidence", "engine-room", "live-receipt.json");

const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const engine = JSON.parse(readFileSync(enginePath, "utf8"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const session = engine.session;
const immutableEnginePath = join(root, "evidence", "engine-room", "runs", `${session}.json`);
if (!readFileSync(immutableEnginePath, "utf8")) {
  throw new Error(`immutable engine-room receipt is missing: ${immutableEnginePath}`);
}
const processTree = Array.isArray(engine.process_tree) ? engine.process_tree : [];
const launchLine = processTree.find(
  (line) =>
    line.includes("zellij") &&
    line.includes("--new-session-with-layout") &&
    line.includes(`--session ${session}`),
);
const serverLine = processTree.find(
  (line) => line.includes("zellij") && line.includes("--server"),
);
const nushellLine = processTree.find(
  (line) => line.includes(" nu ") && line.includes("--env-config"),
);

const ready =
  engine.schema_version === "lifeos.evidence.engine-room-live.v1" &&
  engine.authority === "installed yzx executable and live Zellij/Nushell process tree" &&
  engine.ready === true &&
  Array.isArray(engine.argv) &&
  engine.argv[0] === "yzx" &&
  engine.argv[1] === "enter" &&
  engine.argv[2] === "--session" &&
  engine.argv[3] === session &&
  Boolean(launchLine) &&
  Boolean(serverLine) &&
  Boolean(nushellLine) &&
  typeof engine.nushell_config === "string" &&
  engine.nushell_config.length > 0;

if (!ready) {
  throw new Error("engine-room live receipt does not prove the installed launch boundary");
}

const receiptEvidence = {
  relationship: "installed-engine-room-live-trace",
  proven: true,
  receipt: "evidence/engine-room/live-receipt.json",
  receipt_path: `evidence/engine-room/runs/${session}.json`,
  receipt_sha256: sha256(readFileSync(immutableEnginePath)),
  session,
  argv: engine.argv,
  zellij_launch: launchLine,
  zellij_server: serverLine,
  nushell: nushellLine,
  nushell_config: engine.nushell_config,
  ready: true,
};

const claim003 = evidence.claims.find(
  (claim) => claim.claim_id === "SWARM-CLAIM-003",
);
const claim004 = evidence.claims.find(
  (claim) => claim.claim_id === "SWARM-CLAIM-004",
);
if (!claim003 || !claim004) throw new Error("claims 003 and 004 are missing");

claim003.verification_status = "verified";
claim003.status = "verified";
claim003.conclusion =
  "The installed profile-owned Yazelix frontdoor initialized the configured Zellij layout and a live session during the bounded Engine Room launch.";
claim003.evidence = [
  { relationship: "runtime-package", proven: true, implementation: "installed yzx executable" },
  { relationship: "provider-boundary", proven: true, implementation: "profile-owned zellij layout and launcher" },
  receiptEvidence,
];

claim004.verification_status = "verified";
claim004.status = "verified";
claim004.conclusion =
  "The same installed launch initialized live Nushell processes with the profile-generated env.nu configuration inside the Engine Room session.";
claim004.evidence = [
  { relationship: "deployment-surface", proven: true, implementation: "live Zellij session with Nushell panes" },
  { relationship: "durable-runtime", proven: true, implementation: engine.nushell_config },
  receiptEvidence,
];

evidence.observed_at = engine.observed_at;
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

const matrix = readFileSync(matrixPath, "utf8")
  .split("\n")
  .map((line) => {
    if (line.startsWith("SWARM-CLAIM-003,")) return "SWARM-CLAIM-003,verified,verified";
    if (line.startsWith("SWARM-CLAIM-004,")) return "SWARM-CLAIM-004,verified,verified";
    return line;
  })
  .join("\n");
writeFileSync(matrixPath, matrix);

console.log(
  JSON.stringify(
    {
      status: "ok",
      claims: ["SWARM-CLAIM-003", "SWARM-CLAIM-004"],
      receipt: "evidence/engine-room/live-receipt.json",
      session,
    },
    null,
    2,
  ),
);
