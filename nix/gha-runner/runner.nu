#!/usr/bin/env nu
# Legacy LifeOS runner diagnostic. The canonical listener is composed and supervised
# by Yazelix from FlexNetOS/flexnetos_runner; never install a local service unit.
#
# Usage:  nix run .#runner

def main [
  --runtime: string = "/home/flexnetos/meta/var/lib/yazelix/runtime/runner"
] {
  if not ($"($runtime)/run.sh" | path exists) {
    error make { msg: $"No runner at ($runtime). Run `nix run .#register` first (B1)." }
  }
  cd $runtime
  print $"Launching github-runner from ($runtime) — user-level, Ctrl-C to stop…"
  ^./run.sh
}
