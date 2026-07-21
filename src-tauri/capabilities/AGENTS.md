<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# capabilities

## Purpose
Tauri 2 capability definitions — the explicit allowlist of plugin permissions granted to specific windows. Tauri 2 is deny-by-default; every `invoke` from the frontend must be covered by a permission listed here.

## Key Files
| File | Description |
|------|-------------|
| `default.json` | Identifier `default`, scoped to the `"main"` window. Permissions: `core:default`, `core:event:default`, `core:webview:default`, `core:window:default`, `core:menu:default`, `shell:default`, `shell:allow-open`, `fs:default`. The `$schema` reference points at the generated `../gen/schemas/desktop-schema.json`. |

## For AI Agents

### Working In This Directory
- Adding a new plugin (e.g. `tauri-plugin-clipboard`) means adding both its crate to `../Cargo.toml` AND its permissions to this file's `permissions` array. Without the permission, the IPC silently fails.
- `fs:default` is intentionally broad; durable product state belongs in PostgreSQL/RuVector. App-data paths in `../src/lib.rs` are read only for controlled legacy import, never a frontend-controlled or newly-created product-state write surface. Do not loosen this with `fs:allow-read-text-file` or `fs:allow-write-text-file` without a documented reason.
- Schema validation against `../gen/schemas/desktop-schema.json` happens at build time. If you see a build error about an unknown permission, the schema may be stale — run `bun run tauri:build` (from the repo root) once to regenerate it.

### Verification
The capability file is validated automatically by `cargo build` inside `../`.

## Dependencies

### Internal
- `../gen/schemas/desktop-schema.json` — generated schema for editor autocomplete + build-time validation.

### External
- Tauri 2 plugin permissions (`tauri-plugin-fs`, `tauri-plugin-shell`, core).

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
