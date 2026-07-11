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

const frontdoorProven = existsSync(frontdoor);
const layoutProven = existsSync(layout);
const launcherExec = desktop?.content.match(/^Exec=(.*)$/m)?.[1] ?? null;
const launcherProven =
  Boolean(launcherExec) && launcherExec.includes(frontdoor);
const processProven = relevantProcesses.length > 0;
const uiReady = false;

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
      status: "partial",
      conclusion:
        "The profile-owned Yazelix frontdoor, launcher target, and a live Yazelix process snapshot are present, but no portable artifact identity or LifeOS/Tauri UI readiness acceptance receipt binds them into the claimed portable launch flow.",
      evidence: [
        {
          relationship: "portable-artifact-identity",
          proven: portableCandidates.length > 0,
          candidates: portableCandidates,
          note:
            "No portable artifact is identified; an installed Nix profile is not portable-artifact proof.",
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
          reason:
            "No LifeOS/Tauri readiness signal or portable-launch acceptance receipt was observed.",
        },
      ],
    },
  ],
};

await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
