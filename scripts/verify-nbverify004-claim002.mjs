import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
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

const profileRoot = join(homedir(), ".nix-profile");
const frontdoor = join(profileRoot, "bin", "yzx");
const profileLayout = join(
  profileRoot,
  "configs",
  "zellij",
  "layouts",
  "flexnetos_agent_workspace.kdl",
);
const generatedLayout = join(
  homedir(),
  ".local",
  "share",
  "yazelix",
  "configs",
  "zellij",
  "layouts",
  "flexnetos_agent_workspace.kdl",
);
const sourceLayout = "/home/flexnetos/meta/src/yazelix/configs/zellij/layouts/flexnetos_agent_workspace.kdl";
const sourceFiles = [
  "/home/flexnetos/meta/src/yazelix/packaging/flake_outputs.nix",
  "/home/flexnetos/meta/src/yazelix/docs/contracts/cross_language_runtime_ownership.md",
  "/home/flexnetos/meta/src/yazelix/rust_core/yazelix_core/src/agent_commands.rs",
];
const allowedEnvironmentNames = [
  "YAZELIX_RUNTIME_DIR",
  "YAZELIX_CONFIG_DIR",
  "YAZELIX_STATE_DIR",
  "YAZELIX_LAYOUT_OVERRIDE",
  "YAZELIX_SESSION_CONFIG_PATH",
  "YAZELIX_SESSION_TERMINAL",
  "ZELLIJ_DEFAULT_LAYOUT",
  "ZELLIJ_SESSION_NAME",
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function optionalSha256(path) {
  return existsSync(path) ? sha256(path) : null;
}

function safeRealpath(path) {
  return existsSync(path) ? realpathSync(path) : null;
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

function findDesktopEntry() {
  const preferred = join(
    homedir(),
    ".local",
    "share",
    "applications",
    "com.flexnetos.Yazelix.Agent.desktop",
  );
  const candidates = [preferred];
  for (const directory of [
    join(homedir(), ".local", "share", "applications"),
    "/usr/share/applications",
  ]) {
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      if (name.endsWith(".desktop")) candidates.push(join(directory, name));
    }
  }
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    if (
      path === preferred ||
      content.includes("com.flexnetos.Yazelix.Agent") ||
      content.includes("FlexNetOS Agent")
    ) {
      return { path, content };
    }
  }
  return null;
}

function parseProcessRows(output) {
  return output
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s?(.*)$/);
      return match
        ? {
            pid: Number(match[1]),
            ppid: Number(match[2]),
            comm: match[3],
            args: match[4],
            raw: line,
          }
        : null;
    })
    .filter(Boolean);
}

function processEnvironment(pid) {
  try {
    const entries = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
    return Object.fromEntries(
      entries
        .filter(Boolean)
        .map((entry) => {
          const separator = entry.indexOf("=");
          return [entry.slice(0, separator), entry.slice(separator + 1)];
        })
        .filter(([name]) => allowedEnvironmentNames.includes(name)),
    );
  } catch {
    return {};
  }
}

function parseProfileEntries(value, entries = []) {
  if (Array.isArray(value)) {
    for (const item of value) parseProfileEntries(item, entries);
    return entries;
  }
  if (!value || typeof value !== "object") return entries;
  if (
    typeof value.name === "string" &&
    (value.name === "lifeos_foundation_yzx" ||
      value.name.includes("yazelix"))
  ) {
    entries.push({
      name: value.name,
      attrPath: value.attrPath ?? value.attr_path ?? null,
      originalUrl: value.originalUrl ?? value.original_url ?? null,
      lockedUrl: value.lockedUrl ?? value.locked_url ?? null,
      storePaths: value.storePaths ?? value.store_paths ?? [],
    });
  }
  for (const child of Object.values(value)) {
    parseProfileEntries(child, entries);
  }
  return entries;
}

function sourceAnchor(path, terms) {
  if (!existsSync(path)) {
    return { path, exists: false, sha256: null, lines: {} };
  }
  const lines = readFileSync(path, "utf8").split("\n");
  return {
    path,
    exists: true,
    sha256: sha256(path),
    lines: Object.fromEntries(
      terms.map((term) => [
        term,
        lines.findIndex((line) => line.includes(term)) + 1 || null,
      ]),
    ),
  };
}

const desktop = findDesktopEntry();
const launcherExec = desktop?.content.match(/^Exec=(.*)$/m)?.[1] ?? null;
const layoutOverride =
  launcherExec?.match(/YAZELIX_LAYOUT_OVERRIDE="([^"]+)"/)?.[1] ??
  profileLayout;
const profileListing = run("nix", [
  "profile",
  "list",
  "--profile",
  profileRoot,
]);
const profileJson = run("nix", [
  "profile",
  "list",
  "--profile",
  profileRoot,
  "--json",
]);
let profileEntries = [];
try {
  profileEntries = parseProfileEntries(JSON.parse(profileJson.output));
} catch {
  profileEntries = [];
}
const frontdoorRealpath = safeRealpath(frontdoor);
const storePath = frontdoorRealpath?.match(
  /^(\/nix\/store\/[^/]+-lifeos-foundation-yzx)\//,
)?.[1] ?? null;
const processResult = run("ps", [
  "-eo",
  "pid=,ppid=,comm=,args=",
]);
const processRows = parseProcessRows(processResult.output);
const workspaceRows = processRows.filter((row) =>
  /yzx|zellij|kitty/i.test(`${row.comm} ${row.args}`),
);
const lifeosRows = processRows.filter((row) =>
  ["lifeos", "tauri", "webkitwebprocess"].includes(row.comm.toLowerCase()),
);
const environmentReceipt = workspaceRows
  .map((row) => ({
    pid: row.pid,
    comm: row.comm,
    values: processEnvironment(row.pid),
  }))
  .filter((row) => Object.keys(row.values).length > 0);
const profileOwner = {
  proven:
    Boolean(frontdoorRealpath) &&
    frontdoorRealpath.includes("lifeos-foundation-yzx") &&
    profileListing.output.includes("lifeos_foundation_yzx"),
  profile_root: profileRoot,
  manifest_element: "lifeos_foundation_yzx",
  flake_attr: "packages.x86_64-linux.lifeos_foundation_yzx",
  locked_revision:
    profileListing.output.match(
      /Locked flake URL:\s+github:FlexNetOS\/yazelix\/([0-9a-f]+)/,
    )?.[1] ?? null,
  store_path: storePath,
  frontdoor,
  frontdoor_realpath: frontdoorRealpath,
  frontdoor_sha256: optionalSha256(frontdoor),
  profile_listing_exit_status: profileListing.exit_status,
  profile_listing_sha256: createHash("sha256")
    .update(profileListing.output)
    .digest("hex"),
  profile_entries: profileEntries,
};
const launcherCode = {
  proven:
    Boolean(desktop && launcherExec) &&
    launcherExec.includes(frontdoor) &&
    launcherExec.includes(layoutOverride),
  desktop_path: desktop?.path ?? null,
  desktop_sha256: desktop ? sha256(desktop.path) : null,
  exec: launcherExec,
  layout_override: layoutOverride,
  layout_override_exists: existsSync(layoutOverride),
  profile_layout: profileLayout,
  profile_layout_sha256: optionalSha256(profileLayout),
};
const workspaceResponsibility = {
  proven:
    existsSync(profileLayout) &&
    existsSync(generatedLayout) &&
    /args\s+"env"/.test(readFileSync(generatedLayout, "utf8")) &&
    /args\s+"agent"/.test(readFileSync(generatedLayout, "utf8")),
  source_layout: sourceLayout,
  source_layout_sha256: optionalSha256(sourceLayout),
  generated_layout: generatedLayout,
  generated_layout_sha256: optionalSha256(generatedLayout),
  active_layout: layoutOverride,
  active_layout_sha256: optionalSha256(layoutOverride),
  pane_map: ["sidebar/yazi", "workspace/env", "tools/env", "agent", "Mission Control"],
  owner_boundary:
    "Yazelix owns terminal workspace layout, session, environment, and pane orchestration; this does not establish LifeOS launch ownership.",
  source_anchors: [
    sourceAnchor(sourceFiles[0], ["lifeos_foundation_yzx", "mkYazelix"]),
    sourceAnchor(sourceFiles[1], ["pane orchestrator", "workspace root"]),
    sourceAnchor(sourceFiles[2], ["rtk codex", "yzx agent"]),
  ],
};
const claims = [];
if (existsSync(outputPath)) {
  try {
    const previous = JSON.parse(readFileSync(outputPath, "utf8"));
    claims.push(
      ...(Array.isArray(previous.claims)
        ? previous.claims.filter(
            (candidate) =>
              !["SWARM-CLAIM-002", "SWARM-CLAIM-003", "SWARM-CLAIM-004"].includes(
                candidate.claim_id,
              ),
          )
        : []),
    );
  } catch {
    // A malformed prior receipt must not prevent a fresh bounded collection.
  }
}
const claimId = "SWARM-CLAIM-002";
const claim = {
  claim_id: claimId,
  verification_status: "unverified",
  status: "partial",
  confidence: "medium",
  conclusion:
    "The active profile-owned Yazelix package and launcher establish a live Zellij-based terminal workspace, but no fresh causal LifeOS launch, LifeOS process, UI-ready signal, or LifeOS-to-Yazelix bridge proves that Yazelix is the background workspace engine for a LifeOS application launch.",
  evidence: [
    {
      relationship: "profile-owner",
      ...profileOwner,
    },
    {
      relationship: "launcher-code",
      ...launcherCode,
    },
    {
      relationship: "process-tree",
      proven:
        workspaceRows.some((row) => row.comm === "zellij") &&
        workspaceRows.some((row) => row.comm === "yzx"),
      observed_at_utc: new Date().toISOString(),
      process_snapshot_command: processResult.command,
      process_snapshot_exit_status: processResult.exit_status,
      process_tree: workspaceRows.map(({ raw }) => raw),
      active_store_processes: workspaceRows.filter((row) =>
        row.args.includes(storePath ?? "/nix/store/never"),
      ).map(({ raw }) => raw),
    },
    {
      relationship: "environment-allowlist",
      proven: environmentReceipt.length > 0,
      allowed_names: allowedEnvironmentNames,
      values_by_process: environmentReceipt,
      secret_policy:
        "Only allowlisted runtime-boundary variable names are recorded; all other environment entries are excluded.",
    },
    {
      relationship: "workspace-responsibility",
      ...workspaceResponsibility,
    },
    {
      relationship: "lifeos-binding",
      proven: false,
      lifeos_processes: lifeosRows.map(({ raw }) => raw),
      missing: [
        "lifeos_process_receipt_missing",
        "lifeos_ui_acceptance_receipt_missing",
        "lifeos_bridge_contract_missing",
        "fresh_launch_causality_missing",
        "failure_shutdown_behavior_missing",
      ],
      boundary:
        "Yazelix workspace orchestration is not proof of LifeOS launch ownership.",
    },
  ],
};
const mergedClaims = [
  ...claims.filter((candidate) => candidate.claim_id !== claimId),
  claim,
];
const result = {
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: {
    root: repoRoot,
    package_json_sha256: sha256(join(repoRoot, "package.json")),
  },
  collector: {
    claim_id: claimId,
    mode: "read-only-installed-runtime-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
  claims: mergedClaims,
};

await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
