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
#   nix run .#register                      # mints the token via envctl (B1)
#   nix run .#register -- --token <TOKEN>   # owner supplies a token directly

def main [
  --org: string = "FlexNetOS"
  --repo: string = "lifeos"
  --name: string = "flexnetos-nix-01"
  --labels: string = "self-hosted,flexnetos,nix"
  --token: string = ""                                             # empty => mint via envctl (B1)
  --runtime: string = "/run/user/1001/yazelix/profile-runtime/gha-runner"
] {
  let url = $"https://github.com/($org)/($repo)"

  # 1. Registration token — B1 fence.
  let tok = if ($token | is-empty) {
    print "Minting registration token via envctl (B1 owner-fence)…"
    (^envctl mint gha-runner-registration --org $org | str trim)
  } else { $token }
  if ($tok | is-empty) {
    error make { msg: "No registration token. Pass --token, or run where envctl is reachable (B1)." }
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
