# DESIGN — rUv-native Agent Runner (Phase P)

**Phase:** P (Pseudocode/Design) · Builds on [SPEC.md](./SPEC.md).

## 1. Flake input graph

```
flake.nix
  inputs:
    nixpkgs  = github:NixOS/nixpkgs/nixos-unstable   # pinned in flake.lock (latest + reproducible)
    flake-utils = github:numtide/flake-utils          # per-system boilerplate
  outputs (x86_64-linux):
    packages.gha-runner-substrate   # symlinkJoin: github-runner + nodejs_22 + bun + git + cacert + coreutils
    packages.agent-layer            # buildNpmPackage: host-github-actions@0.1.2 + agentic-flow@2.1.0 (+ kernel@0.1.2)
    packages.gha-runner-closure     # symlinkJoin(substrate ++ agent-layer) — the full "both layers from closure"
    packages.default                # = gha-runner-closure
    apps.register                   # wraps register.nu (envctl token -> config.sh, labels)
    apps.runner                     # wraps runner.nu   (user-level run.sh under profile-runtime)
    checks.substrate-hermetic       # runs verify-hermetic-closure.mjs against the built substrate
    devShells.default               # substrate on PATH for local hacking
```

**Why these choices (grounded):**
- `nixos-unstable` locked → "MANDATORY latest toolchain" (SPEC §3) *and* reproducible.
- `nodejs_22` → ADR-033 pins Node 22 for the harness runtime
  (`metaharness/docs/adrs/ADR-033-host-github-actions.md`).
- `github-runner` **package** (not `services.github-runners` NixOS module) → SPEC §1
  "no system depths"; the module writes a root systemd unit, which is forbidden.
- npm layer by exact version + SRI → SPEC §4 hermeticity; hashes captured live from
  the npm registry (host-github-actions 0.1.2, kernel 0.1.2, agentic-flow 2.1.0).

## 2. The generate → rewrite pipeline (the crux)

ADR-033's `@metaharness/host-github-actions` emits an **interactive-CI default**:
`runs-on: ubuntu-latest` + `actions/setup-node@v4` + `npm ci` (verified against the
real generated `worldgraph/.github/workflows/worldgraph.yml`). Our foundation inverts
all three. Pipeline:

```
1. GENERATE (design-time, reference only — we hand-author the rewritten result):
     npx @metaharness/host-github-actions archbp-env-test
       -> .github/workflows/archbp-env-test.yml   (ubuntu-latest + setup-node + npm ci)
       -> .github/actions/archbp-env-test/action.yml (composite, npm ci at runtime)
2. REWRITE (checked in):
     workflow.runs-on         : ubuntu-latest        -> [self-hosted, flexnetos, nix]
     action step "setup-node" : actions/setup-node   -> REMOVED (node from nix closure on PATH)
     action step "npm ci"     : npm ci               -> REMOVED (agent-layer from nix closure)
     action run step          : node bin/...         -> `agentic-flow` from ${AGENT_LAYER}/bin
     --gha-mode kept          : suppress prompts, JSON to stdout, exit 0/1/2 (ADR-033 §2)
3. GUARD:
     .github/actionlint.yaml declares the 3 self-hosted labels (precedent:
       cognitum-open-design/.github/actionlint.yaml) so actionlint accepts runs-on.
```

Because the runner is self-hosted+Nix, the closure is already on PATH when the job
starts — so `setup-node`/`npm ci` are not just unnecessary, they'd re-introduce OS/network
deps and break hermeticity. Removing them IS the hermetic rewrite.

## 3. Runner lifecycle (user-level, no system depths)

```
register.nu:
  token = envctl mint gha-runner-registration --org FlexNetOS   # B1 fence (owner runs)
  RUNNER_DIR = $PROFILE_RUNTIME/gha-runner            # /run/user/1001/yazelix/profile-runtime/gha-runner
  cp -r ${substrate}/share/github-runner/* $RUNNER_DIR   # config.sh + run.sh live here
  $RUNNER_DIR/config.sh --url https://github.com/FlexNetOS/lifeos \
     --token $token --labels self-hosted,flexnetos,nix --name flexnetos-nix-01 \
     --work $RUNNER_DIR/_work --unattended --replace
runner.nu:
  exec $RUNNER_DIR/run.sh          # foreground; yzx/Zellij pane keeps it alive, OR
  # systemd --user unit (user scope only) for restart-on-boot — NEVER a system unit
```

Volatile state (`_work`, `_diag`, `HARNESS_MEMORY_PATH`) → profile-runtime (SPEC §2).
Durable secrets never leave envctl / the vault boundary.

## 4. Error paths (explicit)

| Failure | Detection | Handling |
|---|---|---|
| npm SRI mismatch | `buildNpmPackage` fixed-output hash fail | hash re-captured from registry; build refuses (fail-closed) |
| OS-path leak in closure | `verify-hermetic-closure.mjs` finds non-`/nix/store` ref | R gate fails; offending dep wrapped/removed |
| registration token expired | `config.sh` returns Http 404 | `register.nu` re-mints once, else surfaces B1 to owner |
| no runner online for labels | `wait-run-green.mjs` timeout (default 300s) | reports "no self-hosted runner picked up job" — NOT a hang |
| provider key missing | agent step non-zero exit, calm stderr | job fails visibly; token never echoed |
| actionlint rejects labels | `actionlint` non-zero | `.github/actionlint.yaml` label list widened |

## 5. Complexity annotation

- **Substrate build:** O(substitute) — `github-runner`/`nodejs`/`bun` are in the nixpkgs
  binary cache; no local compile expected. Verifiable in-session.
- **Agent-layer build:** O(npm-tree) — `agentic-flow@2.1.0` has a large transitive tree;
  `buildNpmPackage` needs an `npmDepsHash` (captured via one failing build that prints the
  expected hash — standard Nix flow). This is the single heavy step; if the in-session
  capture is too costly it is recorded in the checkpoint `blockers` with the exact
  `nix build` command to finish it — the substrate hermeticity gate does not depend on it.
- **Live proof (C):** O(1) network round-trip, but **gated by B1** (runner must be online).

## 6. Done-criteria are exit codes (checkpoint contract)

Each phase gate is a shell command (see SPEC acceptance criteria + README). The build is
crash-resumable via `checkpoint.mjs` (read first, write last). `check` exits 0 (valid),
3 (DONE), or 4 (no-progress: same `next` twice).
