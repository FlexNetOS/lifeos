# G2 gate — plan preconditions for the full-ocean blueprint build. Exit 0 = all hold.
# --canary deliberately breaks one assertion and MUST exit 1 (falsifiability proof).
const PGBIN = "/nix/store/8zm2sma9jgvq101yy4x45za4y28yd164-postgresql-17.10/bin"
const PGSOCK = "/home/flexnetos/meta/var/run/postgresql"
const BLUEPRINT = "/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md"
const BLUEPRINT_SHA = "78d8584d73957e795320d0ca9eb8e5593f1ab6286463e77b4537757dfef220ee"
const MANIFEST = "/home/flexnetos/meta/src/lifeos/.ruvnet-brain/ingest-manifest.json"

def check [name: string, ok: bool] {
  if $ok { print $"ok   ($name)" } else { print $"FAIL ($name)"; exit 1 }
}

def main [--canary] {
  let want_sha = if $canary { "canary-wrong-sha" } else { $BLUEPRINT_SHA }

  check "blueprint file present" ($BLUEPRINT | path exists)
  let sha = (open --raw $BLUEPRINT | hash sha256)
  check $"blueprint sha == ($want_sha | str substring 0..12)…" ($sha == $want_sha)

  let pg = (do { ^$"($PGBIN)/psql" -h $PGSOCK -p 5432 -d lifeos -tAc "select 1" } | complete)
  check "postgres lifeos reachable" ($pg.exit_code == 0 and ($pg.stdout | str trim) == "1")

  let ext = (do { ^$"($PGBIN)/psql" -h $PGSOCK -p 5432 -d lifeos -tAc "select extversion from pg_extension where extname='ruvector'" } | complete)
  check $"ruvector extension present \(($ext.stdout | str trim)\)" (($ext.stdout | str trim | str length) > 0)

  check "codedb ingress binary" ((which codedb | length) > 0)
  check "agentdb project memory (.swarm/memory.db)" ("/home/flexnetos/meta/src/lifeos/.swarm/memory.db" | path exists)

  # scope measured 2026-07-24: 165_027_303_195 bytes, 1_302_038 regular files
  let avail = (do { ^df -B1 --output=avail / } | complete | get stdout | lines | last | str trim | into int)
  check "disk headroom >= 2x scope (330GB)" ($avail >= 354_486_000_000)

  check "ingest manifest present" ($MANIFEST | path exists)
  let m = (open $MANIFEST)
  check "manifest scope is /home/flexnetos" ($m.scope == "/home/flexnetos")
  check "manifest declares exclusions with reasons" (($m.declared_exclusions | all {|e| ($e.reason | str length) > 0 }))
  print "G2 dryrun: all preconditions hold"
}
