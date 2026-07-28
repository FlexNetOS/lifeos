# ART-106 Runtime Dependency Map

Generated: `2026-07-28T11:13:57+00:00`
Status: `complete`

This map records runtime dependency evidence for databases, environment variables, secret references, queues, APIs, and caches. It is built from approved package artifacts, the envctl database model, the target descriptor, and a safe scan that excludes `.env`, secret directories, private keys, PEM files, and key files.

## Scope

- Target: `flexnetos-vs-lifeos`
- Target root: `/home/flexnetos/FlexNetOS`
- Files visited: `3000`
- Runtime live state confirmed: `False`
- Secret material read: `False`
- Envctl database backend: `sqlite`

## Coverage

| Category | Status | Evidence | Files | Top references |
| --- | --- | --- | --- | --- |
| databases | repo_evidence_found | 180 | 48 | `Sqlite` (1551), `sqlite` (727), `PostgreSQL` (699), `Postgres` (488), `postgres` (470), `.db` (455), `SQLite` (454), `libsql` (428) |
| env_vars | repo_evidence_found | 180 | 32 | `META_ROOT` (1587), `M` (1057), `HOME` (359), `DEST` (337), `PATH` (318), `ROOT` (310), `MIGRATION_TARGET_ROOT` (207), `ENVCTL_REPO` (195) |
| secret_refs | repo_evidence_found | 180 | 20 | `vault` (713), `envctl_secrets` (414), `redacted` (365), `private_keys` (302), `credential` (287), `blocked_paths` (234), `redaction` (188), `secrets/` (180) |
| queues | repo_evidence_found | 180 | 71 | `queue` (876), `task_graph` (720), `operations` (275), `run_events` (123), `Queue` (61), `operation queue` (24), `work_queue` (15), `tokio::sync::mpsc` (12) |
| apis | repo_evidence_found | 180 | 5 | `mcp` (3784), `MCP` (1099), `http` (504), `rest` (305), `HTTP` (291), `Initialize` (187), `router.` (168), `openapi` (123) |
| caches | repo_evidence_found | 180 | 60 | `XDG_CACHE_HOME` (110), `cache_dir` (64), `.cache` (55), `sccache` (33), `Redis` (32), `redis` (29), `nix-store` (19), `Nix-store` (14) |

## Envctl Runtime Nodes

| Node | Category | Evidence |
| --- | --- | --- |
| envctl migration SQLite model | databases | `generated/envctl_migration_db_model.json`<br>`sql/001_migration_automation_schema.sql` |
| artifact registry hash/evidence tables | databases | `generated/envctl_artifact_registry_report.json`<br>`scripts/artifact_registry.py` |
| envctl_migration_operations and run_events queue/event surfaces | queues | `generated/envctl_migration_db_model.json` |
| envctl shared protocol schema records | apis | `generated/shared_protocol_manifest.json`<br>`schemas/shared_protocol.schema.json` |

## Hotspot Files

| Path | Categories | Score |
| --- | --- | --- |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.agents/skills/agent-env-codex/references/source-prompt.md` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.claude/skills/agent-env-codex/references/source-prompt.md` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.codex/prompts/prompt:codex-gpt-harness-v3-full-access-no-sandbox.prompt.md` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.codex/prompts/prompt:codex-gpt-harness.prompt.md` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.codex/skills/agent-env-codex/references/source-prompt.md` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.handoff/loop/backlog.md` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/agent-skills/agent-env-codex/references/source-prompt.md` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/envctl-db-nu-plugin-migration-automation-package/execution-framework/migration-artifacts/01-current-state/runtime-dependency-map.md` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/envctl-db-nu-plugin-migration-automation-package/execution-framework/migration-artifacts/art-106_runtime_dep_map/runtime-dependency-map.json` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/envctl-db-nu-plugin-migration-automation-package/execution-framework/migration-artifacts/art-106_runtime_dep_map/runtime-dependency-map.md` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/envctl-db-nu-plugin-migration-automation-package/execution-framework/scripts/generate_art106_runtime_dep_map.py` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/envctl-db-nu-plugin-migration-automation-package/execution-framework/scripts/generate_art113_debug_code_map.py` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/envctl-db-nu-plugin-migration-automation-package/execution-framework/scripts/generate_art116_infra_topology.py` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/envctl-db-nu-plugin-migration-automation-package/execution-framework/scripts/generate_system_inventory.py` | apis, caches, databases, env_vars, queues, secret_refs | 10 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.claude/prompts/prompt:claude-code-agent-env-ultraplan.prompt.md` | apis, databases, env_vars, queues, secret_refs | 8 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.claude/skills/agent-env-claude/SKILL.md` | apis, databases, env_vars, queues, secret_refs | 8 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.handoff/loop/loop_state.md` | apis, databases, env_vars, queues, secret_refs | 8 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.handoff/loop/plan/reports/grit-plan.md` | apis, databases, env_vars, queues, secret_refs | 8 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.handoff/loop/plan/reports/icm-plan.md` | apis, caches, databases, env_vars, secret_refs | 8 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/CLAUDE.md` | apis, databases, env_vars, queues, secret_refs | 8 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/crates/secretd/src/main.rs` | apis, databases, env_vars, queues, secret_refs | 8 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/docs/AGENTS-CHANGE-HISTORY.md` | apis, databases, env_vars, queues, secret_refs | 8 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/docs/KASETTO-FEATURES.md` | apis, caches, databases, env_vars, secret_refs | 8 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/docs/generated/toolchain-signal-inventory.md` | apis, caches, databases, env_vars, secret_refs | 8 |
| `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/envctl-db-nu-plugin-migration-automation-package/PROMPT_PACKAGE_COMBINED.md` | apis, databases, env_vars, queues, secret_refs | 8 |

## Evidence Samples

| Category | Signal | Path | Line | Snippet |
| --- | --- | --- | --- | --- |
| databases | sqlite | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/AGENTS.md` | 20 | gRPC), `secretd` (async tokio daemon), `secretctl` (client), `secrets-store-libsql` |
| databases | sqlite | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/AGENTS.md` | 21 | (libSQL **remote** backend). Design corpus in `docs/secrets/`. |
| databases | sqlite | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/AGENTS.md` | 93 | - **No C library in the trust boundary.** No SQLite/OpenSSL/aws-lc may be *linked*. The store |
| databases | sqlite | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/AGENTS.md` | 94 | uses libSQL `remote` only (`default-features = false`); crypto is pure-Rust (ring, blake3, |
| databases | sqlite | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/AGENTS.md` | 121 | is actually language drift and not an accepted build-time artifact like the libSQL parser's |
| databases | sqlite | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/CLAUDE.md` | 19 | gRPC), `secretd` (async tokio daemon), `secretctl` (client), `secrets-store-libsql` |
| databases | sqlite | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/CLAUDE.md` | 20 | (libSQL **remote** backend). Design corpus in `docs/secrets/`. |
| databases | sqlite | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/CLAUDE.md` | 39 | pins — ring-only rustls, libsql-remote-only, pure-Rust crypto — the security boundary it |
| databases | sqlite | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/CLAUDE.md` | 109 | - **No C library in the trust boundary.** No SQLite/OpenSSL/aws-lc may be *linked*. The store |
| databases | sqlite | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/CLAUDE.md` | 110 | uses libSQL `remote` only (`default-features = false`); crypto is pure-Rust (ring, blake3, |
| env_vars | shell-env | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/README.md` | 7 | - Improved credential security: `persist-credentials` now stores credentials in a separate file under `$RUNNER_TEMP` instead of directly in `.git/config` |
| env_vars | shell-env | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/README.md` | 21 | This action checks-out your repository under `$GITHUB_WORKSPACE`, so your workflow can access it. |
| env_vars | shell-env | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/README.md` | 23 | Only a single commit is fetched by default, for the ref/SHA that triggered the workflow. Set `fetch-depth: 0` to fetch all history for all branches and tags. Refer [here](https://docs.github.com/actions/using-workfl...)  |
| env_vars | shell-env | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/README.md` | 108 | # Relative path under $GITHUB_WORKSPACE to place the repository |
| env_vars | shell-env | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/action.yml` | 56 | description: 'Relative path under $GITHUB_WORKSPACE to place the repository' |
| env_vars | shell-env | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/.github/workflows/update-test-ubuntu-git.yml` | 43 | run: date -u "+now=%Y%m%d.%H%M%S.%3NZ" >> "$GITHUB_OUTPUT" |
| env_vars | js-env | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/git-auth-helper.test.ts` | 13 | const originalRunnerTemp = process.env['RUNNER_TEMP'] |
| env_vars | js-env | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/git-auth-helper.test.ts` | 14 | const originalHome = process.env['HOME'] |
| env_vars | js-env | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/git-auth-helper.test.ts` | 57 | process.env['HOME'] = originalHome |
| env_vars | js-env | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/git-auth-helper.test.ts` | 59 | delete process.env['HOME'] |
| secret_refs | secret-store | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/README.md` | 7 | - Improved credential security: `persist-credentials` now stores credentials in a separate file under `$RUNNER_TEMP` instead of directly in `.git/config` |
| secret_refs | secret-name | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/README.md` | 362 | When using the `checkout` action in your GitHub Actions workflow, it is recommended to set the following `GITHUB_TOKEN` permissions to ensure proper functionality, unless alternative auth is provided via the `token` or ` |
| secret_refs | secret-name | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/.github/workflows/update-test-ubuntu-git.yml` | 22 | # Sets the permissions granted to the `GITHUB_TOKEN` for the actions in this job. |
| secret_refs | secret-name | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/.github/workflows/update-test-ubuntu-git.yml` | 38 | password: <redacted> secrets.GITHUB_TOKEN }} |
| secret_refs | secret-name | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/git-auth-helper.test.ts` | 35 | // Mock setSecret |
| secret_refs | secret-name | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/git-auth-helper.test.ts` | 36 | jest.spyOn(core, 'setSecret').mockImplementation((secret: <redacted>) => {}) |
| secret_refs | secret-name | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/git-auth-helper.test.ts` | 83 | expect(settings.authToken).toBeTruthy() // sanity check |
| secret_refs | secret-name | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/git-auth-helper.test.ts` | 106 | const basicCredential = Buffer.from( |
| secret_refs | secret-name | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/git-auth-helper.test.ts` | 107 | `x-access-token:<redacted>, |
| secret_refs | secret-name | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/git-auth-helper.test.ts` | 112 | `http.${expectedServerUrl}/.extraheader AUTHORIZATION: basic ${basicCredential}` |
| queues | task-queue | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/package-lock.json` | 5702 | "yocto-queue": "^0.1.0" |
| queues | task-queue | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/package-lock.json` | 6008 | "node_modules/queue-microtask": { |
| queues | task-queue | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/package-lock.json` | 6010 | "resolved": "https://registry.npmjs.org/queue-microtask/-/qu....2.3.tgz", |
| queues | task-queue | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/package-lock.json` | 6183 | "queue-microtask": "^1.2.2" |
| queues | task-queue | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/package-lock.json` | 7123 | "node_modules/yocto-queue": { |
| queues | task-queue | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/package-lock.json` | 7125 | "resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz", |
| queues | task-queue | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/__test__/ref-helper.test.ts` | 83 | 'refs/gh/queue/main/pr-123', |
| queues | task-queue | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/CLAUDE.md` | 266 | \| 2026-06-05 \| Add A2 cross-repo parallel build (default-OFF, scale auto-trigger) \| skills/{feature-forge,forge-loop,session-relay}; agents/{rust-implementer,continuity-steward} \| Cross-repo parallelism via the three-own |
| queues | task-queue | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/CLAUDE.md` | 267 | \| 2026-06-08 \| Add grit-harness-parallel opt-in mode \| skills/{feature-forge,forge-loop} \| Adopt grit's claim→work→done AST git-lock coordination into the harness for parallel multi-repo implementations: `grit init` (ide |
| queues | task-queue | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/LESSONS.md` | 44 | \| 2026-07-09 \| forge-loop \| Under a limited-runner local-first CI fleet with strict up-to-date protection, every develop merge re-triggers armed PRs' merge-ref runs and re-BEHINDs them (the "BEHIND treadmill"). Mitigate  |
| apis | endpoint | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/CHANGELOG.md` | 4 | * Fix checkout init for SHA-256 repositories by @yaananth in https://github.com/actions/checkout/pull/2439 |
| apis | endpoint | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/CHANGELOG.md` | 5 | * fix: expand merge commit SHA regex and add SHA-256 test cases by @yaananth in https://github.com/actions/checkout/pull/2414 |
| apis | endpoint | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/CHANGELOG.md` | 8 | * Fix tag handling: preserve annotations and explicit fetch-tags by @ericsciple in https://github.com/actions/checkout/pull/2356 |
| apis | endpoint | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/CHANGELOG.md` | 11 | * Add worktree support for persist-credentials includeIf by @ericsciple in https://github.com/actions/checkout/pull/2327 |
| apis | endpoint | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/CHANGELOG.md` | 14 | * Persist creds to a separate file by @ericsciple in https://github.com/actions/checkout/pull/2286 |
| apis | endpoint | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/CHANGELOG.md` | 15 | * Update README to include Node.js 24 support details and requirements by @salmanmkc in https://github.com/actions/checkout/pull/2248 |
| apis | endpoint | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/CHANGELOG.md` | 18 | * Port v6 cleanup to v5 by @ericsciple in https://github.com/actions/checkout/pull/2301 |
| apis | endpoint | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/CHANGELOG.md` | 21 | * Update actions checkout to use node 24 by @salmanmkc in https://github.com/actions/checkout/pull/2226 |
| apis | endpoint | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/CHANGELOG.md` | 24 | * Port v6 cleanup to v4 by @ericsciple in https://github.com/actions/checkout/pull/2305 |
| apis | endpoint | `src/flexnetos_runner/_work/actions-runner-01-work/_actions/actions/checkout/v6/CHANGELOG.md` | 27 | * docs: update README.md by @motss in https://github.com/actions/checkout/pull/1971 |
| caches | build-cache | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.agents/skills/agent-env-codex/references/source-prompt.md` | 897 | - nix-store -q --roots "$(readlink -f "$(command -v codex)")", if path is in /nix/store |
| caches | cache-api | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.agents/skills/codedb-config-tables/references/commands-and-surfaces.md` | 29 | - use temporary `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` |
| caches | cache-api | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.agents/skills/codedb-ingest/references/commands.md` | 42 | XDG_CACHE_HOME="$TEMP_HOME/.cache" \ |
| caches | cache-api | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.agents/skills/codedb-ingest/references/commands.md` | 64 | XDG_CACHE_HOME="$TEMP_HOME/.cache" |
| caches | build-cache | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.agents/skills/plan-governance-config/SKILL.md` | 24 | `.kb/config.toml`, `.github/workflows/*.yml`, `package.json`/`bun.lock`/`bunfig.toml`, manifests, |
| caches | build-cache | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.claude/agents/plan-governance-config-auditor.md` | 52 | `bunfig.toml`, `manifest/*.toml`, `envctl.lock`, `.cliff.toml`, `qodana.yaml`, `.looprc`, `.env*`, |
| caches | build-cache | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.claude/skills/agent-env-codex/references/source-prompt.md` | 897 | - nix-store -q --roots "$(readlink -f "$(command -v codex)")", if path is in /nix/store |
| caches | cache-api | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.claude/skills/codedb-config-tables/references/commands-and-surfaces.md` | 29 | - use temporary `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` |
| caches | build-cache | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.claude/skills/plan-governance-config/SKILL.md` | 24 | `.kb/config.toml`, `.github/workflows/*.yml`, `package.json`/`bun.lock`/`bunfig.toml`, manifests, |
| caches | build-cache | `src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl/.codex/agents/plan-governance-config-auditor.toml` | 6 | developer_instructions = "# plan-governance-config-auditor \u2014 control-plane + settings/config scan\n\nYou own the planning prompt's governance/settings/config axis for one target or fleet slice. Code plans\nthat igno |

## Gaps

No empty runtime dependency categories in the safe scan.

## Evidence Boundary

- Environment variables and secret references are recorded by reference name only when names are visible in non-secret files.
- Secret values, `.env` files, private key material, PEM files, and blocked directories are excluded.
- Queue/API/cache rows are evidence categories from repository files and envctl database reports, not a claim of deployed live services unless later runtime inventory confirms them.
