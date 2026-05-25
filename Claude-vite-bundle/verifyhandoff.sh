#!/usr/bin/env bash
# verify-handoff.sh — sanity-check the LifeOS repo right after unpacking the bundle.
# Run from repo root or anywhere — it locates itself.
# Exits non-zero if any hard check fails; 0 with warnings is fine.

set -u

fails=0
warns=0
ok()      { printf '  \033[32mok  \033[0m  %s\n' "$1"; }
fail()    { printf '  \033[31mFAIL\033[0m  %s\n' "$1" >&2; fails=$((fails+1)); }
warn()    { printf '  \033[33mwarn\033[0m  %s\n' "$1"; warns=$((warns+1)); }
section() { printf '\n==> %s\n' "$1"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

section "Repo location"
echo "  $REPO_ROOT"

section "Required files"
for f in \
  CLAUDE.md PHASE_A_PLAN.md TODO.md CHANGELOG.md README.md \
  .gitignore .env.example \
  scripts/bootstrap.sh scripts/dev.sh scripts/tauri-dev.sh scripts/verify-handoff.sh \
  project/ui_kits/lifeos_vue/package.json \
  project/ui_kits/lifeos_vue/index.html \
  project/ui_kits/lifeos_vue/src/App.vue \
  project/ui_kits/lifeos_vue/src/stores/lifeos.js \
  project/ui_kits/lifeos_vue/src/stores/lifeos.ts \
  project/ui_kits/lifeos_vue/src/components/CommandPalette.vue \
  project/ui_kits/lifeos_vue/src/components/Sidebar.vue \
  project/ui_kits/lifeos_vue/src-tauri/Cargo.toml \
  project/ui_kits/lifeos_vue/src-tauri/tauri.conf.json
do
  if [[ -e "$f" ]]; then ok "$f"; else fail "missing: $f"; fi
done

section "Script executability"
for s in scripts/bootstrap.sh scripts/dev.sh scripts/tauri-dev.sh scripts/verify-handoff.sh; do
  if [[ -x "$s" ]]; then ok "$s executable"; else fail "$s not executable — run: chmod +x $s"; fi
done

section "Script syntax"
for s in scripts/*.sh; do
  if bash -n "$s" 2>/dev/null; then ok "$s parses"; else fail "$s has syntax errors"; fi
done

section ".env hygiene"
if [[ -f .env ]] && git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env is tracked by git — remove with: git rm --cached .env && git commit"
else
  ok ".env not tracked"
fi
if grep -q '^ANTHROPIC_API_KEY=' .env.example; then
  ok ".env.example has ANTHROPIC_API_KEY"
else
  fail ".env.example missing ANTHROPIC_API_KEY"
fi
if [[ -f .env ]] && grep -q '^ANTHROPIC_API_KEY=.\+' .env; then
  ok ".env has a non-empty ANTHROPIC_API_KEY"
elif [[ -f .env ]]; then
  warn ".env exists but ANTHROPIC_API_KEY is empty — AI chat will fail until filled"
else
  warn ".env not yet created (will be on first ./scripts/bootstrap.sh run)"
fi

section "Git state"
if [[ -d .git ]]; then
  ok "git repo present"
  echo "  HEAD: $(git rev-parse --short HEAD) — $(git log -1 --format=%s)"
  actual_count=$(git rev-list --count HEAD)
  if [[ "$actual_count" -ge 3 ]]; then
    ok "history has $actual_count commits"
  else
    fail "history has $actual_count commits — expected at least 3 (design handoff + CommandPalette + scaffolding)"
  fi
  if git diff --quiet && git diff --cached --quiet; then
    ok "working tree clean"
  else
    warn "uncommitted changes present (run: git status)"
  fi
  if git remote get-url origin >/dev/null 2>&1; then
    ok "origin remote: $(git remote get-url origin)"
  else
    warn "no origin remote — set with: gh repo create FlexNetOS/lifeos-app --private --source=. --remote=origin --push"
  fi
else
  warn "no .git directory — this is the tarball path; init with: git init -b main && git add . && git commit"
fi

section "Toolchain"
if command -v node >/dev/null; then
  v=$(node -p 'process.versions.node')
  major=${v%%.*}
  if [[ "$major" -ge 20 ]]; then ok "node $v"; else warn "node $v (recommend 20+)"; fi
else
  fail "node not installed (https://nodejs.org or use fnm/nvm)"
fi
if command -v npm >/dev/null; then ok "npm $(npm -v)"; else fail "npm not installed"; fi
if command -v cargo >/dev/null; then
  ok "cargo $(cargo --version | awk '{print $2}')"
else
  warn "cargo not installed — required for ./scripts/tauri-dev.sh; install via https://rustup.rs"
fi
if command -v gh >/dev/null; then
  if gh auth status >/dev/null 2>&1; then
    ok "gh authenticated as $(gh api user --jq .login 2>/dev/null)"
  else
    warn "gh installed but not authenticated — run: gh auth login"
  fi
else
  warn "gh CLI not installed — install via 'brew install gh' / 'apt install gh' to push to GitHub"
fi
if command -v claude >/dev/null; then
  ok "claude CLI installed ($(claude --version 2>/dev/null | head -1))"
else
  warn "claude CLI not in PATH — install Claude Code: https://claude.ai/download"
fi

section "Store-shim sync (Phase A invariant)"
# Three sources of truth must list the same state fields. Drift breaks the runtime preview.
# Spot-check: cmdkOpen must appear in all three.
for f in \
  project/ui_kits/lifeos_vue/src/stores/lifeos.js \
  project/ui_kits/lifeos_vue/src/stores/lifeos.ts \
  project/ui_kits/lifeos_vue/index.html
do
  if grep -q 'cmdkOpen' "$f"; then
    ok "cmdkOpen present in $f"
  else
    fail "cmdkOpen missing in $f — store shims have drifted"
  fi
done

section "Summary"
if [[ "$fails" -gt 0 ]]; then
  printf '  \033[31m%d failure(s)\033[0m, %d warning(s) — fix before pushing.\n' "$fails" "$warns" >&2
  exit 1
elif [[ "$warns" -gt 0 ]]; then
  printf '  ok with %d warning(s).\n' "$warns"
  exit 0
else
  printf '  \033[32mall green.\033[0m\n'
  exit 0
fi
