# FlexNetOS vs lifeos comparison evidence

- Task: `REQ-201_FLEXNETOS_LIFEOS_COMPARISON`
- Generated: `2026-07-27T05:15:42+00:00`
- Primary root exists: `True`
- Declared compare root: `/home/flexnetos/lifeos` exists=`True`
- lifeos peer root: `/home/flexnetos/FlexNetOS/src/lifeos` exists=`False`

## Finding

In the captured filesystem, FlexNetOS is the active self-hosted GitHub Actions execution and release workspace. It holds two runner work directories and their envctl, nu_plugin, and flexnetos_runner checkouts. The separate lifeos root is not an application checkout: it contains only five envctl Codex-harness state and audit-ledger files.

Therefore FlexNetOS was used instead of lifeos as the automation host: it ran CI jobs, held build checkouts, and owned release/provenance machinery. lifeos was only a small runtime-state namespace in this snapshot. Historical release code preserves an integration point for packaging a LifeOS bundle, but there is no LifeOS product checkout here to prove that integration was exercised.

## Role split

### FlexNetOS was used for
- Two-slot self-hosted GitHub Actions execution workspace.
- Working checkouts for flexnetos_runner, envctl, nu_plugin, and support crates.
- Local release compilation, staging, provenance, and proof lane.
- A release builder capable of consuming a LifeOS bundle when a product source is supplied.

### lifeos was used for
- Persistence location for envctl Codex-harness ledgers, counters, decisions, and model routing.
- No Git repository, source manifest, application code, build output, or service definition was found.
- Not represented as a node or dependency in the supplied service graph.

## Artifact and code-map evidence

- Repository map: `10` repositories; scope rollup `{'runner-runtime': 10}`.
- Runner repository entry: path `src/flexnetos_runner/_work/actions-runner-01-work/flexnetos_runner/flexnetos_runner`, branch `main`, head `adbf118ef2be`, files `1460`.
- lifeos repository entry: `None`; no LifeOS checkout was inventoried.
- Service graph: `16` nodes and `21` service edges; it models FlexNetOS runner services but no lifeos service.
- Debug code map summary: `{'entry_point_count': 160, 'control_flow_count': 160, 'external_call_count': 160, 'error_path_count': 160, 'log_signal_count': 160, 'metrics_alert_count': 160, 'runbook_signal_count': 160, 'hotspot_count': 80}`.

## Dependency and package evidence

- lifeos tree count: `5` files, `8` directories; skipped blocked paths `0`.
- Top suffixes: `{'.jsonl': 4, '.json': 1}`.
- Release catalog lifeos rows in the captured checkout: `[]`.
- lifeos is a Git repository: `False`.
- runner history: `adbf118 2026-07-13 feat(fxrun): first-class local-release compile lane + CodeDB proof gate + release-repo staging (#248)`.

## Source line evidence

### runner_readme
- L2: ``
- L3: `The **execution plane** of FlexNetOS's GitHub↔local automation: a local, self-hosted runner that`
- L4: `executes CI/jobs/loops on the developer's own hardware and **connects all of meta** by routing work`
- L10: `Two shapes, by design:`
- L11: `1. **Self-hosted GitHub Actions runner** — JIT/ephemeral (`generate-jitconfig`, single-job-then-`
- L12: `   removed), with safety rails (non-root, no Docker socket, `_work` on tmpfs, **fork-PR isolation**).`
- L73: `\| `runner-core` \| — \| Pure core: signed job-spec type, kernel router (delegate-only), fork-PR isolation policy, JIT lifecycle state. Fully unit-tested. \|`
- L74: `\| `runner-actions` \| `fxrun-actions` \| Self-hosted Actions runner supervisor (JIT register → run one → deregister). P1. \|`
- L75: `\| `runner-dispatch` \| `fxrun-dispatch` \| UDS server: verify signed job spec → route → invoke kernel. P2. \|`
- L126: ``
- L127: `Canonical operation is one org-scoped FlexNetOS runner, shared by meta peer repositories through the`
- L128: `labels `self-hosted,linux,x64,local,flexnetos`. A local `.runner` that points at`
- L129: ``https://github.com/FlexNetOS/<repo>` is scope drift, not a new default. Strict upgrade path: stand`
- L177: ``
- L178: ``flexnetos_runner` owns the local release lane for this workstation. The first supported target is`
- L179: `Ubuntu 26.04 on `x86_64`, with artifacts written to the workspace-level `release/` directory. The`

### release_script
- L7: `# so its own on-disk location (with symlinks resolved by cd -P) yields ROOT even when the`
- L8: `# historical /home/flexnetos/FlexNetOS symlink is absent. Explicit env overrides still win.`
- L9: `SCRIPT_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"`
- L301: ``
- L302: `copy_lifeos_bundle_assets() {`
- L303: `  local lifeos_repo="$1" stage="$2"`
- L314: `    yazelix-runtime) copy_yazelix_runtime_assets "$source" "$stage" ;;`
- L315: `    lifeos-bundle) copy_lifeos_bundle_assets "$source" "$stage" ;;`
- L316: `    *) fail "unknown asset profile for catalog component: $profile" ;;`
- L639: `  bun="$(resolve_bun)"`
- L640: `  [[ -n "$bun" ]] \|\| fail "bun not found; set FXRUN_BUN to the LifeOS-compatible bun binary"`
- L641: `  cargo="$(resolve_cargo)"`

### lifeos_last_route
- L2: `  "containment": {`
- L3: `    "browser_computer_use": "disabled_pending_approved_profile",`
- L4: `    "claude_bridge": "disabled_pending_approval",`
- L7: `    "openrouter_shim": "disabled_pending_approval",`
- L8: `    "provider_expansion_allowed": false,`
- L9: `    "subagent_spawn_requires_this_marker": true`
- L11: `  "ok": true,`
- L12: `  "requires_runner": true,`
- L13: `  "route_id": "route-1783753982097093295",`
- L21: `      "github_full_access_enabled": false,`
- L22: `      "model": "active-codex-default",`
- L23: `      "openrouter_enabled": false,`
- L24: `      "profile": "envctl-harness",`
- L25: `      "provider": "codex-profile-frontdoor",`
- L26: `      "reason": "default implementation route",`

## Secret exposure control

- The scanner read only selected safe evidence files and counted lifeos paths without reading blocked path categories.
- Blocked path policy: `['.env', '.git', '.venv', '__pycache__', 'node_modules', 'private_keys', 'secrets', 'target']`.
- Blocked suffix policy: `['.key', '.pem']`.
