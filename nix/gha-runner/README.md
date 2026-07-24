# `nix/gha-runner` — hermetic self-hosted rUv agent runner

A **hermetic, single-nix-profile self-hosted GitHub Actions runner** for
`FlexNetOS/lifeos`, with rUv's `@metaharness/host-github-actions` + `agentic-flow`
layered on top. Everything runs from one Nix flake closure with **zero OS dependencies**.

- **Substrate:** nixpkgs `github-runner` package (NOT the `services.github-runners`
  system module) + `nodejs_22` + `bun` + `git` + `cacert`, launched **user-level**.
- **Agent layer:** `@metaharness/host-github-actions@0.1.2` (emits workflow + composite
  action, ADR-033) · `agentic-flow@2.1.0` · `@metaharness/kernel@0.1.2`, pinned by exact
  version + SRI and materialized by `buildNpmPackage`.
- **Foundation:** one flake, `yzx`-launched, Nushell scripts, envctl-minted token,
  volatile state under `/run/user/1001/yazelix/profile-runtime`.

Grounded in `metaharness/docs/adrs/ADR-033-host-github-actions.md` (Status: IMPLEMENTED).
See [SPEC.md](./SPEC.md) and [DESIGN.md](./DESIGN.md).

## Layout

| Path | What |
|---|---|
| `flake.nix` / `flake.lock` | the hermetic flake (nixos-unstable pinned) |
| `agent-layer/` | pinned rUv npm layer (`package.json` + patched `package-lock.json`) |
| `register.nu` | mint token (envctl) + `config.sh` with labels — **B1 owner action** |
| `runner.nu` | launch `run.sh` user-level under profile-runtime |
| `verify-hermetic-closure.mjs` | assert closure is zero-OS-deps |
| `wait-run-green.mjs` | poll the proof run; assert it ran on the self-hosted runner |
| `checkpoint.mjs` | crash-resumable build state |
| `envctl-registration.md` | the exact B1 owner commands |
| `../../.github/actions/archbp-env-test/action.yml` | composite action (closure on PATH; no setup-node/npm ci) |
| `../../.github/workflows/archbp-env-test.yml` | proof workflow, `runs-on: [self-hosted, flexnetos, nix]` |
| `../../.github/actionlint.yaml` | declares the `flexnetos` / `nix` runner labels |

## Verify what's built (no owner action needed)

```bash
cd nix/gha-runner
nix flake check --no-build                                    # flake evaluates
nix build .#gha-runner-closure --no-link --print-out-paths    # both layers realize
node verify-hermetic-closure.mjs "$(nix build .#gha-runner-closure --no-link --print-out-paths | tail -1)"
actionlint ../../.github/workflows/archbp-env-test.yml        # workflow lints
```

All four pass today. The agent CLIs (`agentic-flow`, `ruvector`, `ruvllm`, `mcp-proxy`)
are on `${closure}/bin`.

## Bring it online — **B1 (owner action)**

`envctl` is the sole authoritative committer and is not reachable from an in-session
agent shell, so registration is done by the owner. Full commands in
[envctl-registration.md](./envctl-registration.md); in short:

```nu
nix run .#register     # envctl mints the registration token, config.sh joins the org
nix run .#runner       # user-level run.sh (keep in a yzx/Zellij pane)
```

Then the live proof (closes Phase C):

```bash
git push
gh workflow run archbp-env-test.yml
node nix/gha-runner/wait-run-green.mjs archbp-env-test.yml --runner self-hosted   # exit 0 = proven
```

## Optional — route existing workflows onto the runner

Not applied automatically (would strand CI offline until the runner is registered).
Apply **after** the runner is online:

```diff
# .github/workflows/ci.yml:25  and  .github/workflows/differential-drive.yml:25
-    runs-on: ubuntu-latest
+    runs-on: [self-hosted, flexnetos, nix]
```

## Notes / gotchas

- **Agent-layer hash capture.** If `agent-layer/package.json` changes, re-capture the
  hash: set `npmDepsHash` to `sha256-AAAA…A=`, run `nix build .#agent-layer`, paste the
  `got:` value back.
- **Phantom optional deps.** `@metaharness/kernel@0.1.2` declares 5 per-platform napi
  `optionalDependencies@0.1.0` that are **all unpublished on npm (404)**. They break
  `npm ci` lock-sync, so they are stripped from `agent-layer/package-lock.json` (the
  fetched set is unchanged — those packages never existed). `--ignore-scripts` skips
  native postinstalls; the JS fallbacks cover a linux runner (agentic-flow PRIMER).
- **No system depths.** The runner is user-level. Never install `services.github-runners`
  (a root systemd unit) or a second profile.
- **`package-lock.json` is force-added** — the repo `.gitignore` excludes it, but this
  isolated agent-layer lock is intentionally tracked so the flake can see it.
