# SPEC — rUv-native Agent Runner on a Hermetic Self-Hosted GitHub Actions Runner

**Phase:** S (Specification) · **Build:** `nix/gha-runner/` · **Repo:** `FlexNetOS/lifeos`
**Grounding:** `metaharness/docs/adrs/ADR-033-host-github-actions.md` (Status: IMPLEMENTED),
`metaharness/packages/host-github-actions/package.json` (v0.1.2),
`concepts/agentic-flow/PRIMER`, `cognitum-open-design/.github/actionlint.yaml`.

## Overview

Stand up a hermetic, single-nix-profile **self-hosted GitHub Actions runner**
(nixpkgs `github-runner` package) registered to the **FlexNetOS** org with labels
`[self-hosted, flexnetos, nix]`, and layer rUv's **`@metaharness/host-github-actions`
v0.1.2** + **`agentic-flow` 2.1.0** onto it so a webhook/dispatch-triggered workflow
runs an agent task end-to-end **inside the Nix closure with zero OS dependencies**.

The proof is an `archbp-*` env-test workflow (running the repo's `tests/archbp-*.spec.ts`
vitest suite) going green on `runs-on: [self-hosted, flexnetos, nix]`.

## Layer contract (grounded)

| Layer | What | Source |
|---|---|---|
| Substrate | nixpkgs `github-runner` package, **user-level** launcher (NOT the NixOS `services.github-runners` system module) | nixpkgs |
| rUv agent | `@metaharness/host-github-actions@0.1.2` emits `.github/workflows/<name>.yml` + composite `action.yml`; `agentic-flow@2.1.0` is the invoked agent runtime | `metaharness/packages/host-github-actions/package.json`, `concepts/agentic-flow/PRIMER` |
| Foundation | one hermetic flake (both layers from the closure), `yzx`-launched, Nushell scripts, envctl-minted token, profile-runtime volatile state | project constraints |

## Non-negotiable constraints

1. **MUST NOT TOUCH SYSTEM DEPTHS** — no root, no `/etc`, no system `systemd` units,
   no second profile. The runner is a **user-level** service.
2. **SINGLE NIX_PROFILE** — `/home/flexnetos/.nix-profile` is the sole owner.
   Volatile runner/agent state under `/run/user/1001/yazelix/profile-runtime`.
3. **LATEST TOOLCHAIN** — nixpkgs pinned to `nixos-unstable` (locked in `flake.lock`);
   npm layer re-verified against live registry (done: host-github-actions 0.1.2,
   kernel 0.1.2, agentic-flow 2.1.0).
4. **HERMETIC** — both layers materialize from the flake closure; npm layer pinned by
   exact version + SRI integrity; zero reliance on system node/npm/OS libraries.
5. **HEAL, DO NOT HARM** — existing workflows (`ci.yml`, `differential-drive.yml`) are
   NOT flipped to self-hosted in-place (would strand CI until B1). The flip ships as a
   ready-to-apply README diff, applied only on owner consent.

## Acceptance criteria

- [ ] `nix flake check ./nix/gha-runner` evaluates clean, and
      `nix build ./nix/gha-runner#gha-runner-substrate` builds the substrate closure.
- [ ] The substrate closure contains `github-runner`, `nodejs`, `bun`, `git`, `cacert`
      and references only `/nix/store` paths (zero OS deps) — proven by
      `node nix/gha-runner/verify-hermetic-closure.mjs`.
- [ ] The agent layer (`@metaharness/host-github-actions@0.1.2`, `agentic-flow@2.1.0`,
      `@metaharness/kernel@0.1.2`) is pinned by exact version + SRI integrity in a
      checked-in manifest/lock and materialized by `buildNpmPackage`.
- [ ] A composite action `.github/actions/archbp-env-test/action.yml` runs the agent
      layer from the Nix closure — NOT via `actions/setup-node` + `npm ci` (the ADR-033
      default is rewritten).
- [ ] A workflow `.github/workflows/archbp-env-test.yml` targets
      `runs-on: [self-hosted, flexnetos, nix]` and passes `actionlint` (with the
      self-hosted labels declared in `.github/actionlint.yaml`).
- [ ] A Nushell `register.nu` configures the runner (org `FlexNetOS`, the three labels)
      using an **envctl-minted** registration token, and `runner.nu` launches it
      user-level under profile-runtime.
- [ ] A README runbook documents the exact single owner action at fence **B1** and the
      ready-to-apply `runs-on` flip for existing workflows.

## Edge cases identified

- **Token expiry** — GitHub registration tokens are short-lived (~1h); `register.nu`
  must mint immediately before `config.sh`, and re-mint on `Http 404` from config.
- **Runner offline** — the proof workflow will queue indefinitely if no runner with the
  labels is online; `wait-run-green.mjs` must time out and report "no self-hosted runner
  picked up the job" rather than hang.
- **Non-hermetic leak** — an OS-path (`/usr`, `/lib`, `/home` outside store) in the
  closure fails the hermeticity check; the substrate must not `makeWrapper` against
  impure paths.
- **Ephemeral vs persistent runner** — default to `--ephemeral` (one job then
  de-register) is safest for hermeticity, but breaks multi-job memory; SPEC chooses a
  **persistent** runner with `HARNESS_MEMORY_PATH` under profile-runtime (ADR-033 §6).
- **Provider secrets absent** — if `ANTHROPIC_API_KEY` etc. are not injected, the agent
  step fails cleanly with a calm error; the composite action must not leak the token.

## Fence (owner action, not blockable in-session)

- **B1** — envctl-minted org registration token + FlexNetOS org runner registration.
  `envctl` is the sole authoritative committer and is unreachable from an in-session
  shell. Build proceeds to this fence; owner runs one `envctl` commit + `register.nu`.
