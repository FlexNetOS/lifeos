# Configuration Inventory

Generated: `2026-07-27T21:38:47+00:00`
Task: `ART-115_CONFIG_INVENTORY`
Target root: `/run/user/1001/lifeos-json-task-runner/20260727T212315401740Z-f7b145f5f97d/ART-115_CONFIG_INVENTORY/20260727T213812259147Z-7d2060e018f0`

## Summary

| metric | value |
|---|---:|
| `scanned_files` | 40 |
| `scanned_text_files` | 28 |
| `config_file_count` | 11 |
| `env_var_reference_count` | 49 |
| `feature_flag_reference_count` | 25 |
| `secret_reference_count` | 2 |
| `blocked_path_count` | 0 |

## Config Files

| path | kind | secret-named |
|---|---|---:|
| `.gitignore` | `.gitignore` | false |
| `.mcp.json` | `json` | false |
| `Cargo.toml` | `toml` | false |
| `flake.lock` | `lock` | false |
| `flake.nix` | `nix` | false |
| `package.json` | `json` | false |
| `single-profile-migration.receipt.20260721T024201394036642Z.json` | `json` | false |
| `single-profile-migration.receipt.20260723T152433853021380Z.json` | `json` | false |
| `single-profile-migration.receipt.20260727T012301578363882Z.json` | `json` | false |
| `single-profile-migration.receipt.20260727T030431645274462Z.json` | `json` | false |
| `tsconfig.json` | `json` | false |

## Environment Variable References

| name | refs | sample paths |
|---|---:|---|
| `AGENTDB_SRC` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `APPDATA` | 2 | `AUDIT.md`, `CHANGELOG.md` |
| `BIBI8A` | 1 | `bun.lock` |
| `BUN_INSTALL_CACHE_DIR` | 1 | `flake.nix` |
| `CHQ` | 1 | `bun.lock` |
| `CLYQ` | 1 | `bun.lock` |
| `COGNITUM_API_KEY` | 1 | `.mcp.json` |
| `COGNITUM_SEED_TOKEN` | 1 | `.mcp.json` |
| `FEATURES` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `FG58AQ` | 1 | `bun.lock` |
| `HOME` | 2 | `ENVIRONMENT-cloud-session.md`, `flake.nix` |
| `JKGQ` | 1 | `bun.lock` |
| `KHA` | 1 | `bun.lock` |
| `LIBCLANG_PATH` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `MFOBA` | 1 | `bun.lock` |
| `NIX_EXPR` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `NV67Q` | 1 | `bun.lock` |
| `PGRX_HOME` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `PG_CONFIG` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `PKQ` | 1 | `bun.lock` |
| `PWD` | 1 | `HANDOFF.md` |
| `RUFLO_SRC` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `RUVECTOR_SRC` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `SSL_CERT_FILE` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `TAURI_DEBUG` | 1 | `vite.config.ts` |
| `TAURI_DEV_HOST` | 1 | `vite.config.ts` |
| `TG_OP` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `TG_TABLE_NAME` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `TG_TABLE_SCHEMA` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `TMPDIR` | 1 | `flake.nix` |
| `TRBQ` | 1 | `bun.lock` |
| `ddl` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `embedding_append_guards` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `envelope_guards` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `extension_locations` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `function` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `id` | 1 | `AUDIT.md` |
| `js` | 1 | `bun.lock` |
| `migration` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `out` | 2 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`, `flake.nix` |
| `pgrxSrc` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `projection_triggers` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `rls` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `roles` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `rvf_guards` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `rvf_integrity_triggers` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `state` | 1 | `AUDIT.md` |
| `system` | 2 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`, `flake.nix` |
| `tenant_guards` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |

## Feature Flag References

| name | refs | sample paths |
|---|---:|---|
| `Disable` | 1 | `yazilix-nix-isolated-persistant.md` |
| `Disabled` | 1 | `DESIGN.md` |
| `ENABLE` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `FEATURES` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `Feature` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `Flagged` | 1 | `CHANGELOG.md` |
| `Flags` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `bitflags` | 1 | `Cargo.lock` |
| `cargoBuildFlags` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `causal_experiments` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `cpufeatures` | 1 | `Cargo.lock` |
| `dag_set_enabled` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `disabled` | 3 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`, `DESIGN.md`, `yazilix-nix-isolated-persistant.md` |
| `enable` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `enabled` | 1 | `TODO.md` |
| `feature` | 5 | `AUDIT.md`, `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`, `CHANGELOG.md` |
| `features` | 4 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md`, `CHANGELOG.md`, `HANDOFF.md` |
| `flag` | 5 | `AUDIT.md`, `DESIGN.md`, `HANDOFF.md` |
| `flagged` | 2 | `CHANGELOG.md`, `TODO.md` |
| `flags` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `ruvector_dag_is_enabled` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `ruvector_dag_set_enabled` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `ruvector_enable_learning` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `ruvector_enable_tenant_rls` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |
| `ruvector_healing_enable` | 1 | `Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md` |

## Secret References

Secret values were not captured. Only names and reference locations are listed.

| name | kind | refs | sample paths |
|---|---|---:|---|
| `COGNITUM_API_KEY` | `env_or_setting_name` | 1 | `.mcp.json` |
| `COGNITUM_SEED_TOKEN` | `env_or_setting_name` | 1 | `.mcp.json` |

## Scan Policy

- Blocked patterns: `**/.env, **/secrets/**, **/private_keys/**, **/*.pem, **/*.key`
- Secret values captured: `false`
