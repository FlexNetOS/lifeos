# DONE conjunction for the full-ocean build. Exit 0 = release-grade done.
# Runs every gate in order; first failure stops with its exit code.
def run-gate [name: string, cmd: closure] {
  print $"=== gate: ($name)"
  let r = (do $cmd | complete)
  print ($r.stdout | str trim | str substring 0..400)
  if $r.exit_code != 0 {
    print $"GATE FAIL ($name) exit ($r.exit_code)"
    print ($r.stderr | str trim | str substring 0..400)
    exit $r.exit_code
  }
}

def main [] {
  cd /home/flexnetos/meta/src/lifeos
  run-gate "G2 dryrun" { ^nu gates/dryrun.nu }
  run-gate "G4 reconcile" { ^nu gates/reconcile.nu }
  run-gate "bun test" { ^bun run test }
  run-gate "bun build" { ^bun run build }
  run-gate "cargo no-default-features (ESP32 guard)" { ^cargo check -p lifeos-core --no-default-features }
  run-gate "design lint" { ^bun run design:lint }
  run-gate "git-kb doctor" { ^git-kb doctor }
  run-gate "nix app build (hermetic)" { ^nix build .#lifeos --no-link }
  print "ALL GATES GREEN"
}
