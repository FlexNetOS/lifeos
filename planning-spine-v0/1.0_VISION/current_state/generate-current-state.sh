#!/usr/bin/env bash
# generate-current-state.sh — LifeOS current-state map GENERATOR (VISION artifact B)
#
# Doctrine (VISION - Project Artifacts.md): artifacts must be GENERATED, version-controlled,
# diffable, and tied to real systems — never hand-drawn diagrams that rot. This script computes
# the LifeOS system inventory, the cross-repo dependency graph, and the TEAS convergence evidence
# from the live filesystem + git + Cargo metadata, and writes them beside this file.
#
# Usage:
#   bash generate-current-state.sh            # fast: inventory + dep graph + convergence probe
#   bash generate-current-state.sh --build    # also run `cargo check` on the TEAS target crates
#
# Toolchain: run under a login shell (`bash -lc`) so the nix profile (cargo/git) is on PATH.
# No non-core deps; output is deterministic given the same tree (ordering is sorted).
# `set -u` (catch unset vars) without -e/pipefail: this is a best-effort scanner — a no-match
# grep or one unreadable repo must not abort the whole map.
set -u

ROOT="${LIFEOS_ROOT:-/home/flexnetos/lifeos}"
SRC="$ROOT/src"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DO_BUILD=0
[ "${1:-}" = "--build" ] && DO_BUILD=1

# The eight TEAS contexts and where they live (context|repo_dir). gitkb is an external binary.
TEAS_CONTEXTS=(
  "intent-frontdoor|prompt_hub"
  "contract-governance|rusty-idd"
  "execution-kernel|handoff"
  "dispatch-substrate|meta"
  "runtime-swarm|meta-ruvector"
  "learning-memory|meta-ruvector"
  "batch-pipeline|envctl"
  "runtime-swarm-js|ruflo"
)

echo "[gen] LifeOS current-state @ $STAMP  root=$ROOT  build=$DO_BUILD" >&2

# ---------------------------------------------------------------------------
# 1. SYSTEM INVENTORY  ->  SYSTEM_INVENTORY.md + system_inventory.json
# ---------------------------------------------------------------------------
inv_md="$OUT/SYSTEM_INVENTORY.md"
inv_json="$OUT/system_inventory.json"
{
  echo "# LifeOS System Inventory (generated)"
  echo
  echo "> Generated $STAMP by \`generate-current-state.sh\`. Do not hand-edit — regenerate."
  echo
  echo "| Repo | Git | Lang | Tracked src files | HEAD | Dirty | Purpose |"
  echo "|---|---|---|--:|---|---|---|"
} > "$inv_md"

json_rows=""
if [ -d "$SRC" ]; then
  while IFS= read -r d; do
    name="$(basename "$d")"
    is_git="no"; head=""; dirty=""; lang="-"; files=0; purpose=""
    if git -C "$d" rev-parse --git-dir >/dev/null 2>&1; then
      is_git="yes"
      head="$(git -C "$d" rev-parse --short HEAD 2>/dev/null || echo '?')"
      [ -n "$(git -C "$d" status --porcelain 2>/dev/null | head -1)" ] && dirty="yes" || dirty="no"
      files="$(git -C "$d" ls-files '*.rs' '*.ts' '*.py' '*.go' 2>/dev/null | wc -l | tr -d ' ')"
    fi
    [ -f "$d/Cargo.toml" ] && lang="rust"
    [ -f "$d/package.json" ] && { [ "$lang" = "rust" ] && lang="rust+node" || lang="node"; }
    # one-line purpose: Cargo description, else first README heading line
    if [ -f "$d/Cargo.toml" ]; then
      purpose="$(grep -m1 -E '^\s*description\s*=' "$d/Cargo.toml" 2>/dev/null | sed -E 's/^[^"]*"//; s/".*$//' || true)"
    fi
    if [ -z "$purpose" ] && [ -f "$d/README.md" ]; then
      # first prose line (starts with a letter) — skips markdown headings, badges, HTML, lists
      purpose="$(grep -m1 -E '^[A-Za-z]' "$d/README.md" 2>/dev/null | cut -c1-90 || true)"
    fi
    purpose="${purpose//|/ }"
    printf '| %s | %s | %s | %s | %s | %s | %s |\n' "$name" "$is_git" "$lang" "$files" "$head" "$dirty" "$purpose" >> "$inv_md"
    json_rows="${json_rows}{\"name\":\"$name\",\"git\":\"$is_git\",\"lang\":\"$lang\",\"src_files\":$files,\"head\":\"$head\",\"dirty\":\"$dirty\"},"
  done < <(find "$SRC" -mindepth 1 -maxdepth 1 -type d | sort)
fi
printf '{"generated_at":"%s","root":"%s","repos":[%s]}\n' "$STAMP" "$ROOT" "${json_rows%,}" > "$inv_json"
echo "[gen] wrote $inv_md + $inv_json" >&2

# ---------------------------------------------------------------------------
# 2. CROSS-REPO DEPENDENCY GRAPH  ->  DEPENDENCY_GRAPH.md
#    Computed by grepping each repo's Cargo.toml files for cross-repo `path = "../<repo>"` deps.
# ---------------------------------------------------------------------------
dep_md="$OUT/DEPENDENCY_GRAPH.md"
{
  echo "# LifeOS Cross-Repo Dependency Graph (generated)"
  echo
  echo "> Generated $STAMP. Edges = a Cargo.toml \`path = \"../<repo>/...\"\` dependency crossing a repo boundary."
  echo
  echo '```mermaid'
  echo 'graph LR'
} > "$dep_md"
if [ -d "$SRC" ]; then
  while IFS= read -r d; do
    from="$(basename "$d")"
    # find cross-repo path deps: path = "../<other>/..." where <other> != from
    grep -rhoE 'path\s*=\s*"\.\.(/\.\.)*/[a-zA-Z0-9_-]+' "$d" --include=Cargo.toml \
      --exclude-dir=target --exclude-dir=node_modules --exclude-dir=_work --exclude-dir=vendor --exclude-dir=.git 2>/dev/null \
      | sed -E 's#.*/([a-zA-Z0-9_-]+)$#\1#' | sort -u \
      | while IFS= read -r to; do
          [ -n "$to" ] && [ "$to" != "$from" ] && [ -d "$SRC/$to" ] && echo "  $from --> $to"
        done
  done < <(find "$SRC" -mindepth 1 -maxdepth 1 -type d | sort) | sort -u >> "$dep_md"
fi
echo '```' >> "$dep_md"
echo "[gen] wrote $dep_md" >&2

# ---------------------------------------------------------------------------
# 3. TEAS CONVERGENCE PROBE  ->  CONVERGENCE.md
#    Which repos reference the canonical task schema tag `handoff.task.v1`? (computed evidence)
# ---------------------------------------------------------------------------
conv_md="$OUT/CONVERGENCE.md"
{
  echo "# TEAS Convergence Evidence (generated)"
  echo
  echo "> Generated $STAMP. Counts of \`handoff.task.v1\` references per repo — the independent"
  echo "> convergence on one task contract that justifies unification (NORTH_STAR §3)."
  echo
  echo "| Repo | files referencing \`handoff.task.v1\` |"
  echo "|---|--:|"
} > "$conv_md"
if [ -d "$SRC" ]; then
  while IFS= read -r d; do
    name="$(basename "$d")"
    n="$(grep -rIl 'handoff\.task\.v1' "$d" --exclude-dir=target --exclude-dir=node_modules --exclude-dir=_work --exclude-dir=vendor --exclude-dir=.git 2>/dev/null | wc -l | tr -d ' ')"
    [ "${n:-0}" -gt 0 ] && printf '| %s | %s |\n' "$name" "$n" >> "$conv_md"
  done < <(find "$SRC" -mindepth 1 -maxdepth 1 -type d | sort)
fi
echo "[gen] wrote $conv_md" >&2

# ---------------------------------------------------------------------------
# 4. BUILD MATRIX (opt-in --build)  ->  BUILD_MATRIX.md
# ---------------------------------------------------------------------------
if [ "$DO_BUILD" = "1" ]; then
  bm_md="$OUT/BUILD_MATRIX.md"
  {
    echo "# TEAS Build Matrix (generated, --build)"
    echo
    echo "> Generated $STAMP via \`cargo check\`. Real execution; last line of output shown."
    echo "> Note: the batch-pipeline context (execution-framework) is Python and physically lives inside the"
    echo "> envctl repo; the envctl row's cargo check proves envctl's Rust compiles, not the Python pipeline."
    echo
    echo "| Context | Repo | cargo check | Evidence |"
    echo "|---|---|---|---|"
  } > "$bm_md"
  declare -A seen
  for entry in "${TEAS_CONTEXTS[@]}"; do
    ctx="${entry%%|*}"; repo="${entry##*|}"
    key="$repo"; [ -n "${seen[$key]:-}" ] && continue; seen[$key]=1
    d="$SRC/$repo"
    if [ -f "$d/Cargo.toml" ]; then
      # Verdict from the real exit code (not a last-line grep). --workspace checks only the
      # workspace-INCLUDED members; excluded crates (per each repo's Cargo.toml `exclude`) are not built.
      log="$(cd "$d" && timeout 300 cargo check --workspace 2>&1)"; rc=$?
      tail="$(printf '%s' "$log" | tail -1)"
      if [ "$rc" -eq 0 ]; then res="OK"; elif [ "$rc" -eq 124 ]; then res="TIMEOUT"; else res="FAIL"; fi
      printf '| %s | %s | %s | %s |\n' "$ctx" "$repo" "$res" "rc=$rc; ${tail//|/ }" >> "$bm_md"
    else
      printf '| %s | %s | %s | %s |\n' "$ctx" "$repo" "n/a" "no Cargo.toml (external/js)" >> "$bm_md"
    fi
  done
  echo "[gen] wrote $bm_md" >&2
fi

echo "[gen] done. Outputs in $OUT/" >&2
