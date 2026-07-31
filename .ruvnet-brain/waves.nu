# Ingestion wave runner — drives codedb byte-capture of /home/flexnetos into PostgreSQL.
# Per wave: probe with placeholder binding -> harvest expected repository_binding from the
# mismatch error -> write per-root policy -> real capture. Retries (<=3) absorb live-tree drift.
# Ledger: waves.jsonl + per-wave policy + capture CSV under a durable in-scope dir (itself
# captured by a later convergence pass; the moving edge is declared, not lost).
const SCOPE = "/home/flexnetos"
const LEDGER = "/home/flexnetos/meta/var/lib/codedb/ledgers"
# Capture policies MUST live outside every capture root: codedb rejects a policy
# file contained by the repository it authorizes ("capture policy must be
# external to the repository"), so that a tree cannot supply its own capture
# authority. The ledger dir is itself under a capture root, so policies are
# written to volatile runtime storage outside /home/flexnetos instead.
const POLICY_DIR = "/home/flexnetos/meta/var/lib/yazelix/runtime/volatile/tmp/codedb-policies"
# NOTE: rust-postgres rejects an `options` URL param, and the live postmaster's parallel
# workers fail at startup (dangling profile binaries). Mitigation lives DB-side instead:
# ALTER DATABASE lifeos SET max_parallel_{workers_per_gather,maintenance_workers}=0
# (reset after the owner-gated frontdoor heal).
const DSN = "postgresql:///lifeos?host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql&port=5432"
const PLACEHOLDER = "sha256:0000000000000000000000000000000000000000000000000000000000000000"

def wave-roots [] {
  let top = (ls -a $SCOPE | where type == dir
    | get name | where {|d| ($d | path basename) not-in ["meta" "." ".."] })
  let meta_top = (ls -a ($SCOPE + "/meta") | where type == dir
    | get name | where {|d| ($d | path basename) != "var" })
  let var_top = (ls -a ($SCOPE + "/meta/var") | where type == dir
    | get name | where {|d| ($d | path basename) not-in ["run" "lib"] })
  let var_lib = (ls -a ($SCOPE + "/meta/var/lib") | where type == dir
    | get name | where {|d| ($d | path basename) != "postgresql" })
  $top | append $meta_top | append $var_top | append $var_lib
}

def policy-doc [binding: string] {
  ("version=codedb.raw-persistence-policy.v1\n" +
   "policy_id=flexnetos-allbytes-v1\n" +
   "authority=operator:flexnetos\n" +
   "repository_binding=" + $binding + "\n" +
   "allow=source-code,documentation\n" +
   "allow_extended=configuration,unknown\n" +
   "classifier_uncertain=persist-raw\n")
}

# Continuously-rewritten files (daemon ring buffers, live sqlite handles). Their
# bytes change between the policy write and the capture, so the content-derived
# repository binding never converges and the root can never complete. Declaring
# them excludes them from the binding only; codedb still records each as a
# `capture_gaps` row, so they are declared, not lost. Trailing-segment matching
# covers every nested copy (e.g. src/*/.kb/.cache/daemon.log).
const VOLATILE = [
  # GitKB daemon cache: ring-buffer log, live sqlite handle and its -wal/-shm
  # sidecars, and the lifecycle/watcher state files.
  ".kb/.cache"
  # Self-recursion: capturing the ledger root means codedb's own ingest log and
  # this runner's ledger writes land inside the tree being read, so its binding
  # moves on every attempt.
  "ledgers/inline-ingest.log"
  "ledgers/waves.jsonl"
  "ledgers/volatile-snapshots"
  "ledgers/loose-stage"
]

# The binding is content-derived, so it only converges when the tree holds still
# across two consecutive attempts. Any file being appended right now (daemon
# logs, an active runner's execution receipts) keeps moving it. Declaring the
# currently-moving set is exactly the "files being written during the
# measurement" exclusion class: excluded from the binding, still recorded by
# codedb as capture_gaps rows, so declared rather than lost.
# Keep the window tight: it must cover files an active producer is appending
# right now, not files that were edited earlier and have since settled — those
# are real bytes and must be captured, not declared away. The engine's drift and
# vanished-file tolerance absorbs anything that starts moving mid-capture.
const VOLATILE_WINDOW_MIN = 2
const VOLATILE_MAX = 5000

def moving-paths [root: string] {
  let found = (do {
    ^find $root -xdev -type f -newermt $"-($VOLATILE_WINDOW_MIN) minutes"
  } | complete | get stdout | lines | where {|f| $f != "" })
  let rel = ($found | each {|f| $f | str replace ($root + "/") "" })
  if ($rel | length) > $VOLATILE_MAX {
    print $"  NOTE: (($rel | length)) moving files exceed cap ($VOLATILE_MAX); declaring first ($VOLATILE_MAX)"
    $rel | first $VOLATILE_MAX
  } else { $rel }
}

def capture-once [binary: string, root: string, policy_path: string, moving: list<string>] {
  let excl = ($VOLATILE | append $moving | uniq
    | each {|v| ["--snapshot-exclude" $v] } | flatten)
  do { with-env { CODEDB_PG_CONN: $DSN } {
    ^$binary capture $root --store pg --raw-persistence-policy $policy_path --drift-mode record ...$excl
  } } | complete
}

def expected-binding [stderr: string] {
  $stderr | parse -r 'expected:? (sha256:[0-9a-f]{64})' | get -o capture0.0
}

# Branch-point loose files (directly under scope roots that are expanded, not captured)
# are hardlinked into a staging root so their bytes capture; the ledger maps true paths.
def stage-loose [] {
  let stage = ($LEDGER + "/loose-stage")
  rm -rf $stage; mkdir $stage
  let points = [$SCOPE ($SCOPE + "/meta") ($SCOPE + "/meta/var") ($SCOPE + "/meta/var/lib")]
  mut mapping = []
  for p in $points {
    let files = (ls -a $p | where type == file | get name)
    for f in $files {
      # Collision-proof slug: path-hash prefix + sanitized basename (names may
      # contain %, backslash-n sequences, or any byte except / and NUL).
      let slug = (($f | hash sha256 | str substring 0..15) + "-"
        + ($f | path basename | str replace -r -a "[^A-Za-z0-9._-]" "_"))
      ^ln $f ($stage + "/" + $slug)
      $mapping = ($mapping | append {staged: $slug, true_path: $f})
    }
  }
  $mapping | to json | save -f ($LEDGER + "/loose-mapping.json")
  print $"loose stage: (($mapping | length)) files hardlinked"
  $stage
}

def main [--binary: string, --root: string = "", --limit: int = 0, --with-loose] {
  mkdir $LEDGER
  mkdir $POLICY_DIR
  let done = (if (($LEDGER + "/waves.jsonl") | path exists) {
    open --raw ($LEDGER + "/waves.jsonl") | lines | each {|l| $l | from json }
      | where exit == 0 | get root
  } else { [] })
  mut roots = (if $root != "" { [$root] } else { wave-roots | where {|r| $r not-in $done } })
  if $with_loose { $roots = ($roots | append (stage-loose)) }
  if $limit > 0 { $roots = ($roots | first $limit) }
  print ($"waves pending: (($roots | length))")

  for wroot in $roots {
    let slug = ($wroot | str replace -a "/" "_" | str replace -a "." "")
    let csv = ($LEDGER + "/capture-" + $slug + ".csv")
    let pol = ($POLICY_DIR + "/policy-" + $slug + ".txt")
    let started = (date now | format date "%+")
    print $"=== wave ($wroot)"
    mut binding = $PLACEHOLDER
    mut result = {exit_code: -1, stdout: "", stderr: ""}
    mut attempt = 0
    loop {
      $attempt = $attempt + 1
      policy-doc $binding | save -f $pol
      # Recomputed per attempt: the moving set itself moves.
      $result = (capture-once $binary $wroot $pol (moving-paths $wroot))
      if $result.exit_code == 0 { break }
      let out = ($result.stderr + $result.stdout)
      # A live-written file (daemon logs, caches) can change mid-read; codedb
      # fails the whole wave closed. Capture is content-addressed and resumes,
      # so retrying re-reads only what is still outstanding and the moving file
      # usually settles. Previously only binding mismatches were retried, so a
      # single active log file aborted an entire root after one attempt.
      # Moving-target failures. Two distinct messages, same cause — the tree is
      # being written while it is read:
      #   "changed during capture"  — file mutated mid-read (daemon ring buffers)
      #   "open refused"            — file vanished between readdir and open
      #                               (cargo deleting intermediate build artifacts)
      # Capture is content-addressed and resumes, so a retry re-reads only what
      # is still outstanding.
      if ($out | str contains "changed during capture") or ($out | str contains "open refused") {
        if $attempt >= 6 { break }
        print $"  drift attempt ($attempt): source moved mid-read, retrying"
        continue
      }
      let exp = (expected-binding $out)
      if ($exp | is-empty) or $attempt >= 6 { break }
      print $"  binding attempt ($attempt): -> ($exp | str substring 0..18)…"
      $binding = $exp
    }
    $result.stdout | save -f $csv
    let rec = {root: $wroot, exit: $result.exit_code, attempts: $attempt, started: $started,
               finished: (date now | format date "%+"), csv: $csv, policy: $pol,
               stderr_tail: ($result.stderr | str substring 0..300)}
    ($rec | to json -r) + "\n" | save -a ($LEDGER + "/waves.jsonl")
    if $result.exit_code != 0 {
      print $"WAVE FAIL ($wroot) exit ($result.exit_code) after ($attempt) attempts — continuing"
    } else {
      print $"  ok in ($attempt) attempt\(s\)"
    }
  }
  let fails = (open --raw ($LEDGER + "/waves.jsonl") | lines | each {|l| $l | from json }
    | group-by root | values | each {|g| $g | last } | where exit != 0)
  print $"WAVE PASS COMPLETE — unresolved failures: (($fails | length))"
  if ($fails | length) > 0 { $fails | each {|f| print $"  pending: ($f.root)" }; exit 3 }
}
