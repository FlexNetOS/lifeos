# B1 — envctl-minted runner registration (OWNER ACTION)

> **Do NOT hand-edit the live envctl table.** `envctl` is the sole authoritative
> committer (per repo CLAUDE.md). This file documents the *inputs* the owner feeds
> through envctl's committer — it does not mutate any table itself.

The hermetic runner needs a GitHub **runner-registration token** (short-lived, ~1h) to
join the FlexNetOS org. That token, and the agent provider keys, are minted by envctl.

## What the owner runs (one session, on the profile-owned host)

```nu
# 1. Mint a runner-registration token for the org and register the runner.
#    register.nu calls `envctl mint gha-runner-registration --org FlexNetOS` internally;
#    run it where envctl is on PATH (an in-session agent shell is NOT such a place):
cd /home/flexnetos/meta/src/lifeos/nix/gha-runner
nix run .#register            # mints via envctl, then config.sh with the 3 labels

# 2. Launch the runner (user-level; NEVER a system systemd unit):
nix run .#runner              # foreground; keep in a yzx/Zellij pane

# 3. Provider secrets for the agent step — commit through envctl's committer, NOT by hand.
#    These map to the workflow's `env:` secrets (ANTHROPIC_API_KEY, etc.). Add them as
#    GitHub Actions secrets on FlexNetOS/lifeos so the composite action can read them:
gh secret set ANTHROPIC_API_KEY  --repo FlexNetOS/lifeos --body "$(envctl get anthropic-api-key)"
gh secret set OPENROUTER_API_KEY --repo FlexNetOS/lifeos --body "$(envctl get openrouter-api-key)"
gh secret set OPENAI_API_KEY     --repo FlexNetOS/lifeos --body "$(envctl get openai-api-key)"
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
