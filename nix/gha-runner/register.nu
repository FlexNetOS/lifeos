#!/usr/bin/env nu
# Register the hermetic Nix github-runner to FlexNetOS/lifeos with labels
# [self-hosted, flexnetos, nix].
#
# B1 OWNER-FENCE: the runner registration token is envctl-minted. `envctl` is the
# sole authoritative committer and is NOT reachable from an in-session agent shell,
# so this script is run by the owner on the profile-owned host (or with an explicit
# --token). Volatile runner state lives under profile-runtime; nothing touches the OS.
#
# Usage:
#   nix run .#register -- --installation-id <ID>   # mint via envctl GitHub App (B1)
#   nix run .#register -- --token <TOKEN>          # owner supplies a runner-registration token directly

def main [
  --org: string = "FlexNetOS"
  --repo: string = "lifeos"
  --name: string = "flexnetos-nix-01"
  --labels: string = "self-hosted,flexnetos,nix"
  --installation-id: string = ""                                   # GitHub App installation id for `envctl secret mint-github`
  --token: string = ""                                             # empty => mint via envctl (B1)
  --runtime: string = "/run/user/1001/yazelix/profile-runtime/gha-runner"
] {
  let url = $"https://github.com/($org)/($repo)"

  # 1. Registration token — B1 fence.
  #    Verified against `envctl secret --help` (source: meta/src/envctl/crates/cli):
  #    envctl does NOT mint runner-registration tokens directly. It mints a GitHub App
  #    *installation* access token (`secret mint-github`); that token is then exchanged
  #    for a runner-registration token via GitHub's REST API. Two real steps.
  let tok = if ($token | is-empty) {
    if ($installation_id | is-empty) {
      error make { msg: "Pass --installation-id (for `envctl secret mint-github`) or --token directly (B1)." }
    }
    print "Minting GitHub App installation token via envctl, then exchanging for a runner token (B1)…"
    # NOTE: `.token` is the assumed field on the mint-github JSON contract — confirm once
    #       against a live `envctl secret mint-github ... | from json` (vault must be unlocked).
    let app_tok = (^envctl secret mint-github --installation-id $installation_id --output json --ttl-secs 3600 | from json | get token)
    with-env { GH_TOKEN: $app_tok } {
      (^gh api --method POST $"/repos/($org)/($repo)/actions/runners/registration-token" --jq ".token" | str trim)
    }
  } else { $token }
  if ($tok | is-empty) {
    error make { msg: "No registration token. Pass --token, or run where envctl + gh are reachable (B1)." }
  }

  # 2. Materialize a writable runner dir under profile-runtime (volatile state, SPEC §2).
  mkdir $runtime
  let substrate = (^nix build --no-link --print-out-paths ".#gha-runner-substrate" | str trim)
  # github-runner ships config.sh / run.sh; discover their dir rather than hardcode.
  let cfg = (^find $substrate -name "config.sh" | lines | first)
  if ($cfg | is-empty) {
    error make { msg: $"config.sh not found under ($substrate) — check the github-runner package layout." }
  }
  let src = ($cfg | path dirname)
  ^cp -rn $"($src)/." $runtime
  cd $runtime

  # 3. Configure unattended with our three labels; replace any existing runner.
  ^./config.sh --url $url --token $tok --labels $labels --name $name --work $"($runtime)/_work" --unattended --replace

  print $"Registered ($name) -> ($url) with labels [($labels)]."
  print "Next: `nix run .#runner`  (or a systemd --user unit — NEVER a system unit)."
}
