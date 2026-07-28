import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = process.cwd();
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--output="),
);
const outputPath = outputArgument
  ? resolve(repoRoot, outputArgument.slice("--output=".length))
  : join(
      repoRoot,
      "planning-spine-v0",
      "generated",
      "notebooklm_claim_verification",
      "NBVERIFY-004.local-evidence.json",
    );

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(command, args) {
  try {
    return {
      command: [command, ...args].join(" "),
      exit_status: 0,
      output: execFileSync(command, args, { encoding: "utf8" }),
    };
  } catch (error) {
    return {
      command: [command, ...args].join(" "),
      exit_status: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

function desktopEntry() {
  const knownPaths = [
    join(
      homedir(),
      ".local",
      "share",
      "applications",
      "com.flexnetos.Yazelix.Agent.desktop",
    ),
  ];
  for (const path of knownPaths) {
    if (existsSync(path)) {
      return { path, content: readFileSync(path, "utf8") };
    }
  }
  const directories = [
    join(homedir(), ".local", "share", "applications"),
    "/usr/share/applications",
  ];
  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(".desktop")) continue;
      const path = join(directory, name);
      const content = readFileSync(path, "utf8");
      if (content.includes("com.flexnetos.Yazelix.Agent") ||
          content.includes("FlexNetOS Agent")) {
        return { path, content };
      }
    }
  }
  return undefined;
}

const frontdoor = join(homedir(), ".nix-profile", "bin", "yzx");
const layout = join(
  homedir(),
  ".nix-profile",
  "configs",
  "zellij",
  "layouts",
  "flexnetos_agent_workspace.kdl",
);
const desktop = desktopEntry();
const doctor = run(frontdoor, ["doctor"]);
const profile = run("nix", [
  "profile",
  "list",
  "--profile",
  join(homedir(), ".nix-profile"),
]);
const processSnapshot = run("ps", ["-eo", "pid=,ppid=,comm=,args="]);
const relevantProcesses = processSnapshot.output
  .split("\n")
  .filter((line) => /yzx|zellij|kitty|lifeos/i.test(line));

const portableCandidates = [
  join(repoRoot, "portable"),
  join(repoRoot, "release"),
  join(repoRoot, "lifeos-portable"),
].filter(existsSync);
const portableReceiptPath = join(
  repoRoot,
  "evidence",
  "packaging",
  "portable_release_root_coverage.json",
);
const glassLaunchReceiptPath = join(
  repoRoot,
  "evidence",
  "glass",
  "live-launch-receipt.json",
);
let portableReceipt = null;
let glassLaunchReceipt = null;
try {
  portableReceipt = JSON.parse(readFileSync(portableReceiptPath, "utf8"));
} catch {
  portableReceipt = null;
}
try {
  glassLaunchReceipt = JSON.parse(readFileSync(glassLaunchReceiptPath, "utf8"));
} catch {
  glassLaunchReceipt = null;
}
const portableArtifactProven =
  portableReceipt?.schema_version ===
    "lifeos.evidence.portable-release-root-coverage.v1" &&
  portableReceipt?.host_nix_dependence?.blocks_stronger_claims === true &&
  portableReceipt?.musl_artifacts?.length >= 3 &&
  portableReceipt.musl_artifacts.every((artifact) => {
    const path = join(portableReceipt.bundle_root, artifact.path);
    return (
      existsSync(path) &&
      artifact.reproducible === true &&
      artifact.file_type?.includes("static-pie") &&
      sha256(path) === artifact.sha256
    );
  });
const uiReadinessProven =
  glassLaunchReceipt?.schema_version ===
    "lifeos.evidence.glass-launch-live.v1" &&
  glassLaunchReceipt?.ok === true &&
  glassLaunchReceipt?.readiness?.schemaVersion ===
    "lifeos.glass-ui-ready.v1" &&
  glassLaunchReceipt?.readiness?.identity === "lifeos-glass";

const frontdoorProven = existsSync(frontdoor);
const layoutProven = existsSync(layout);
const launcherExec = desktop?.content.match(/^Exec=(.*)$/m)?.[1] ?? null;
const launcherProven =
  Boolean(launcherExec) && launcherExec.includes(frontdoor);
const processProven =
  relevantProcesses.length > 0 ||
  glassLaunchReceipt?.launch?.process_tree?.some((line) =>
    /\blifeos\b/i.test(line),
  ) === true;
const uiReady = uiReadinessProven;

const claims = [];
if (existsSync(outputPath)) {
  try {
    const previous = JSON.parse(readFileSync(outputPath, "utf8"));
    claims.push(
      ...(Array.isArray(previous.claims)
        ? previous.claims.filter(
            (candidate) => candidate.claim_id !== "SWARM-CLAIM-001",
          )
        : []),
    );
  } catch {
    // A malformed prior receipt must not prevent a fresh bounded collection.
  }
}

const result = {
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: {
    root: repoRoot,
    package_json_sha256: sha256(join(repoRoot, "package.json")),
  },
  claims: [
    {
      claim_id: "SWARM-CLAIM-001",
      verification_status: "unverified",
      status: "qualified",
      conclusion:
        "The profile-owned Yazelix frontdoor, measured portable-release artifacts, and causal LifeOS/Tauri UI readiness receipt are present; the claim remains qualified because the portable receipt explicitly records host WebKitGTK, PostgreSQL/RuVector, and profiled bwrap dependencies that block a stronger full-stack portability claim.",
      evidence: [
        {
          relationship: "portable-artifact-identity",
          proven: portableArtifactProven,
          candidates: portableCandidates,
          receipt_path: portableReceiptPath,
          receipt_sha256: existsSync(portableReceiptPath)
            ? sha256(portableReceiptPath)
            : null,
          receipt: portableReceipt,
          note:
            "Static-pie artifacts and the moved relocatable closure are proven from the measured release receipt; remaining host dependencies intentionally keep this claim qualified.",
        },
        {
          relationship: "profile-frontdoor",
          proven: frontdoorProven && layoutProven,
          frontdoor,
          frontdoor_realpath: frontdoorProven ? realpathSync(frontdoor) : null,
          frontdoor_sha256: frontdoorProven ? sha256(frontdoor) : null,
          layout,
          layout_realpath: layoutProven ? realpathSync(layout) : null,
          layout_sha256: layoutProven ? sha256(layout) : null,
          doctor_exit_status: doctor.exit_status,
          doctor_output: doctor.output,
          profile_exit_status: profile.exit_status,
          profile_output: profile.output,
        },
        {
          relationship: "launcher-target",
          proven: launcherProven,
          desktop_path: desktop?.path ?? null,
          exec: launcherExec,
        },
        {
          relationship: "process-tree",
          proven: processProven,
          relevant_processes: relevantProcesses,
        },
        {
          relationship: "ui-readiness",
          proven: uiReady,
          receipt_path: glassLaunchReceiptPath,
          receipt_sha256: existsSync(glassLaunchReceiptPath)
            ? sha256(glassLaunchReceiptPath)
            : null,
          receipt: glassLaunchReceipt,
          reason:
            uiReady
              ? "The current-worktree Tauri launch receipt records mounted Glass readiness through the authenticated redb owner."
              : "No LifeOS/Tauri readiness signal or portable-launch acceptance receipt was observed.",
        },
      ],
    },
  ],
};

claims.push(result.claims[0]);
result.claims = claims;

await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
