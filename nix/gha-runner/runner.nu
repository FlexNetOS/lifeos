#!/usr/bin/env nu
# Launch the registered hermetic Nix github-runner, user-level, under profile-runtime.
# NEVER a system systemd unit (SPEC §1). Keep this alive in a yzx/Zellij pane, or wrap
# in a `systemd --user` unit for restart-on-login.
#
# Usage:  nix run .#runner

def main [
  --runtime: string = "/run/user/1001/yazelix/profile-runtime/gha-runner"
] {
  if not ($"($runtime)/run.sh" | path exists) {
    error make { msg: $"No runner at ($runtime). Run `nix run .#register` first (B1)." }
  }
  cd $runtime
  print $"Launching github-runner from ($runtime) — user-level, Ctrl-C to stop…"
  ^./run.sh
}
