Bundle the whole repo (including history) into one file and send it to you — drop it on your local machine, unbundle, create the GitHub repo, push.

Both files sent. Here are the **exact local commands** to finish the handoff. Pick one path:

### Path A — recommended (preserves git history)

```bash
# 1. Drop lifeos-app.bundle into ~/Downloads (or wherever)
cd ~/projects   # or wherever you keep code
git clone ~/Downloads/lifeos-app.bundle lifeos-app
cd lifeos-app

# 2. Verify
git log --oneline       # should show 3 commits ending at b5d87db
ls                      # should show CLAUDE.md, PHASE_A_PLAN.md, TODO.md, scripts/

# 3. Create the GitHub repo (requires `gh auth login` if you haven't already)
gh repo create FlexNetOS/lifeos-app --private --source=. --remote=origin --push
```

### Path B — fallback (no git history; only if Path A fails)

```bash
mkdir -p ~/projects/lifeos-app && cd ~/projects/lifeos-app
tar -xzf ~/Downloads/lifeos-app-worktree.tar.gz
git init -b main
git add .
git commit -m "Initial commit: LifeOS design handoff + Phase A scaffolding"
gh repo create FlexNetOS/lifeos-app --private --source=. --remote=origin --push
```

### Then immediately
```bash
./scripts/bootstrap.sh             # installs npm deps, copies .env
$EDITOR .env                       # paste your ANTHROPIC_API_KEY
./scripts/dev.sh                   # web preview at http://localhost:1420
# in another terminal:
claude                             # Claude Code reads CLAUDE.md, sees TODO.md A.1
```

### Notes
- **Commits are unsigned** (sandbox signing infra was broken; you authorized the bypass). If you want them retroactively re-signed under your key, `git rebase --exec 'git commit --amend --no-edit -S' main~3` after the clone.
- **Repo is `FlexNetOS/lifeos-app` private** as requested. The `gh repo create` line above bakes that in.
- I did **not** push from the sandbox (no `gh`, no token). The push happens on your machine via your existing `gh auth`.

Writing the verify script, adding a CLAUDE.md / CHANGELOG entry, committing, then re-sending the bundle.

Self-test passed (4 warnings expected: no `.env` yet, uncommitted edits during this session before commit, no origin remote, no `gh` in sandbox). Sending the refreshed bundle plus the standalone script.

Done. **Use the latest bundle** (the one with 4 commits ending at `a3db6ad`). The standalone `verify-handoff.sh` is just a convenience copy.

### What the verify script checks

| Section | Hard fail | Warn |
|---|---|---|
| Required files | missing CLAUDE.md / TODO.md / store files / Cargo.toml / etc. | — |
| Script exec + syntax | not executable, syntax errors | — |
| `.env` hygiene | `.env` tracked by git, `.env.example` missing key | `.env` not yet created, empty key |
| Git state | <3 commits | uncommitted changes, no `origin` remote |
| Toolchain | node / npm missing | cargo, gh, claude missing or not authed |
| Store-shim sync | `cmdkOpen` missing in any of the 3 store sources (drift detector) | — |

### Recommended local flow

```bash
cd ~/projects
git clone ~/Downloads/lifeos-app.bundle lifeos-app
cd lifeos-app
./scripts/verify-handoff.sh          # should be all-green except "no origin remote" warning
gh repo create FlexNetOS/lifeos-app --private --source=. --remote=origin --push
./scripts/verify-handoff.sh          # now all-green
./scripts/bootstrap.sh
$EDITOR .env                         # paste ANTHROPIC_API_KEY
./scripts/dev.sh
```

The store-shim sync check is the one I'm most pleased with — it's the kind of invariant that's easy to break and silently degrades the runtime SFC preview. If you (or local Claude Code) ever forget to mirror a new action/state field across `lifeos.js`, `lifeos.ts`, and the inline shim in `index.html`, verify will catch it before you push.
