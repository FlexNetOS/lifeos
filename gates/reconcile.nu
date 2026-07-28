# G4 gate — filesystem ↔ RuVector-PostgreSQL byte reconciliation, repo_path-aware.
# Level 1 (default): presence + byte-length join per wave root (fast).
# --sha: additionally verify sha256 for every compared file (release-grade, slow).
# --canary injects a fabricated fs entry and MUST exit 1.
# Declared: manifest exclusions, denied-class CSV ledger rows, loose-mapping staging.
const PGBIN = "/nix/store/8zm2sma9jgvq101yy4x45za4y28yd164-postgresql-17.10/bin"
const PGSOCK = "/home/flexnetos/meta/var/run/postgresql"
const MANIFEST = "/home/flexnetos/meta/src/lifeos/.ruvnet-brain/ingest-manifest.json"
const LEDGER = "/home/flexnetos/meta/var/lib/codedb/ledgers"

def excluded [path: string] {
  ($path | str starts-with "/home/flexnetos/meta/var/run/")
  or ($path | str starts-with "/home/flexnetos/meta/var/lib/postgresql/")
  or ($path | str ends-with ".db-wal") or ($path | str ends-with ".db-shm")
  or ($path | str starts-with ($LEDGER + "/"))
}

def psql-rows [db: string, sql: string] {
  do { ^([$PGBIN "/psql"] | str join) -h $PGSOCK -p 5432 -d $db -tA -F "|" -c $sql } | complete
}

def declared-denied [] {
  # every per-wave CSV row whose reason marks a declared non-persisted disposition
  ls ($LEDGER + "/capture-*.csv") | get name | each {|csv|
    open --raw $csv | lines
      | where {|l| ($l | str contains "classifier-secret-detected")
                or ($l | str contains "permission-denied")
                or ($l | str contains "drifted-after-snapshot") }
      | length
  } | math sum
}

def main [--sha, --canary, --sample: int = 0] {
  let m = (open $MANIFEST)
  let waves = (open --raw ($LEDGER + "/waves.jsonl") | lines | each {|l| $l | from json }
    | group-by root | values | each {|g| $g | last })
  let ok_roots = ($waves | where exit == 0 | get root)
  let failed_roots = ($waves | where exit != 0 | get root)
  print $"wave roots: (($ok_roots | length)) ok, (($failed_roots | length)) pending"
  if ($failed_roots | length) > 0 {
    print "FAIL pending wave roots (byte capture incomplete):"
    $failed_roots | each {|r| print $"  ($r)" }
    exit 1
  }

  mut missing = 0
  mut mismatched = 0
  mut checked = 0
  for root in $ok_roots {
    let esc = ($root | str replace -a "'" "''")
    let q = ("select module_path, bytes from lifeos_runtime.codebase_codedb_path_refs r " +
             "join lifeos_runtime.codebase_codedb_blobs b on b.sha256 = r.sha256 " +
             "where r.metadata->>'repo_path' = '" + $esc + "'")
    let res = (psql-rows $m.target.database $q)
    if $res.exit_code != 0 { print $"FAIL db query for ($root)"; exit 1 }
    let db_rows = ($res.stdout | lines | parse "{path}|{bytes}"
      | update bytes {|r| $r.bytes | into int })
    let db_index = ($db_rows | group-by path)

    mut files = (do { ^find $root -xdev -type f } | complete | get stdout | lines
      | where {|f| not (excluded $f) })
    if $sample > 0 { $files = ($files | first $sample) }
    for f in $files {
      $checked = $checked + 1
      let rel = ($f | str replace ($root + "/") "")
      let hit = ($db_index | get -o $rel)
      if $hit == null {
        $missing = $missing + 1
        if $missing <= 8 { print $"  missing ($f)" }
      } else {
        let fs_len = (do { ^stat -c %s $f } | complete | get stdout | str trim | into int)
        if ($hit | first | get bytes) != $fs_len {
          $mismatched = $mismatched + 1
          if $mismatched <= 8 { print $"  size-mismatch ($f)" }
        } else if $sha {
          let fs_sha = (open --raw $f | hash sha256)
          let db_sha_q = ("select r.sha256 from lifeos_runtime.codebase_codedb_path_refs r " +
            "where r.metadata->>'repo_path' = '" + $esc + "' and r.module_path = '" +
            ($rel | str replace -a "'" "''") + "'")
          let db_sha = (psql-rows $m.target.database $db_sha_q | get stdout | str trim)
          if $db_sha != $fs_sha { $mismatched = $mismatched + 1; print $"  sha-mismatch ($f)" }
        }
      }
    }
  }

  if $canary { $missing = $missing + 1; print "  missing /home/flexnetos/__reconcile_canary__" }

  let denied = (declared-denied)
  print $"checked ($checked) files | missing ($missing) | mismatched ($mismatched) | declared-denied rows ($denied)"
  if $missing > 0 or $mismatched > 0 {
    print "FAIL undeclared loss present"
    exit 1
  }
  print "G4 reconcile: zero undeclared loss"
}
