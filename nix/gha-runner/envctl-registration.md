# B1 — envctl-minted runner registration (OWNER ACTION)

> **Do NOT hand-edit the live envctl table.** `envctl` is the sole authoritative
> committer (per repo CLAUDE.md). This file documents the *inputs* the owner feeds
> through envctl's committer — it does not mutate any table itself.

The hermetic runner needs a GitHub **runner-registration token** (short-lived, ~1h) to
join the org. envctl does not mint that token type directly — it mints a GitHub App
**installation access token** (`envctl secret mint-github`), which is then exchanged for a
runner-registration token via GitHub's REST API. Both verbs below are verified against
`envctl secret --help` (source: `meta/src/envctl/crates/cli`).

> Preconditions: the secretd **vault must be unlocked** (`envctl secret unlock`) and you
> must know the GitHub App **installation id**. Confirm the mint JSON shape once with
> `envctl secret mint-github --installation-id <ID> --output json --ttl-secs 3600 | from json`
> — `register.nu` reads the `.token` field.

## What the owner runs (one session, on the profile-owned host)

These are **Nushell** commands (the profile shell is `…/toolbin/nu`). Note nu uses
`(cmd …)` for command substitution — not bash `$(…)`.

```nu
# 0. Unlock the vault (USB-first; passphrase fallback).
envctl secret unlock

# 1. Register the runner. register.nu mints the App installation token via
#    `envctl secret mint-github`, exchanges it for a runner-registration token, then runs
#    config.sh with the 3 labels. Run where envctl + gh are on PATH (NOT an in-session shell):
cd /home/flexnetos/meta/src/lifeos/nix/gha-runner
nix run .#register -- --installation-id <INSTALLATION_ID>
#   …or supply a runner-registration token you obtained yourself:
# nix run .#register -- --token <RUNNER_REGISTRATION_TOKEN>

# 2. Launch the runner (user-level; NEVER a system systemd unit):
nix run .#runner              # foreground; keep in a yzx/Zellij pane

# 3. Provider secrets for the agent step. Read each from the vault with
#    `envctl secret secret get <NAME> --reveal` and set it as a GitHub Actions secret so
#    the composite action's `env:` can read it (names must match the vault secret names):
gh secret set ANTHROPIC_API_KEY  --repo FlexNetOS/lifeos --body (envctl secret secret get anthropic-api-key --reveal | str trim)
gh secret set OPENROUTER_API_KEY --repo FlexNetOS/lifeos --body (envctl secret secret get openrouter-api-key --reveal | str trim)
gh secret set OPENAI_API_KEY     --repo FlexNetOS/lifeos --body (envctl secret secret get openai-api-key --reveal | str trim)
```

## Proposed envctl row (for the committer — informational)

| key | value | scope | why |
|---|---|---|---|
| `GHA_RUNNER_ORG` | `FlexNetOS` | agent-env | target org for `config.sh --url` |
| `GHA_RUNNER_LABELS` | `self-hosted,flexnetos,nix` | agent-env | labels the workflow's `runs-on` matches |
| `GHA_RUNNER_WORKDIR` | `/run/user/1001/yazelix/profile-runtime/gha-runner` | agent-env | volatile runner state (profile-runtime) |

The registration token itself is **minted on demand** (not stored) because it expires in
~1h; `register.nu` mints immediately before `config.sh`.

## After registration — the live proof (closes Phase C)

```bash
git push                                             # publish the workflow + action
gh workflow run archbp-env-test.yml                  # dispatch on the self-hosted runner
node nix/gha-runner/wait-run-green.mjs archbp-env-test.yml --runner self-hosted
```

`wait-run-green.mjs` exits 0 iff the run concluded **success on a
`[self-hosted, flexnetos, nix]` runner** — the end-to-end proof.
