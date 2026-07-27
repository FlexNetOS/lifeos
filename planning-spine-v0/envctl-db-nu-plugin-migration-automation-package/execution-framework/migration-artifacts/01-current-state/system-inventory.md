# System Inventory

Generated at: `2026-07-27T18:09:15+00:00`
Task: `ART-100_SYSTEM_INVENTORY`
Target: `flexnetos-vs-lifeos`
Target root: `/run/user/1001/lifeos-json-task-runner/20260727T033323851132Z-b4e24d277985/ART-100_SYSTEM_INVENTORY/20260727T180755817261Z-349277b3e266`
Descriptor hash: `sha256:b3f653f9e9cda7991821687f041cb540ce3e4342bde03ef333aa0e72a6b42384`

## Coverage

- Files scanned: `43`
- Blocked paths skipped: `0`
- Directories skipped by generated/cache policy: `2`

| category | count |
|---|---:|
| apis | 0 |
| applications | 3 |
| databases | 3 |
| jobs | 0 |
| queues | 5 |
| reports | 0 |
| schedulers | 0 |
| scripts | 0 |
| services | 0 |

## Applications

| kind | path | detail |
|---|---|---|
| rust_workspace | `Cargo.toml` | name=20260727T180755817261Z-349277b3e266; members=src-tauri, crates/lifeos-core, crates/lifeos-daemon |
| nix_flake | `flake.nix` |  |
| node_package | `package.json` | name=lifeos-vue; scripts=build, check, design:diff, design:export, design:export:dtcg, design:export:tailwind, design:lint, dev |

## Services

_No filesystem evidence found in the bounded scan._

## Jobs

_No filesystem evidence found in the bounded scan._

## Databases

| kind | path | detail |
|---|---|---|
| schema_or_migration | `execution-framework/generated/contract_manifest.seed.sql` |  |
| schema_or_migration | `sql/001_migration_automation_schema.sql` |  |
| schema_or_migration | `sql/002_views_and_indexes.sql` |  |

## Queues

| kind | path | detail |
|---|---|---|
| queue_signal | `CHANGELOG.md` |  |
| queue_signal | `SESSIONS.md` |  |
| queue_signal | `TODO.md` |  |
| queue_signal | `execution-framework/generated/contract_manifest.seed.sql` |  |
| queue_signal | `sql/001_migration_automation_schema.sql` |  |

## Apis

_No filesystem evidence found in the bounded scan._

## Reports

_No filesystem evidence found in the bounded scan._

## Scripts

_No filesystem evidence found in the bounded scan._

## Schedulers

_No filesystem evidence found in the bounded scan._
