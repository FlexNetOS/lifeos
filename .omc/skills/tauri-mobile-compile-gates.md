---
name: tauri-mobile-compile-gates
description: tauri::menu / tauri::tray / app.set_menu calls must sit inside #[cfg(desktop)] before any iOS/Android build can compile. Top-level `use tauri::menu::*` will also break mobile.
triggers:
  - tauri ios
  - tauri android
  - tauri mobile
  - tauri::menu
  - tauri::tray
  - mobile compile error
  - cargo tauri ios init
  - cargo tauri android init
  - cfg(desktop)
  - cfg(mobile)
  - tauri::mobile_entry_point
---

# Tauri 2 mobile compile-gates

## The Insight

Tauri 2 ships a desktop-only API surface (`tauri::menu`, `tauri::tray`, `app.set_menu()`, `app.tray_handle()`, the `Submenu`/`MenuItem`/`PredefinedMenuItem` types, global shortcuts, dialog) that does **not exist** on iOS or Android — those targets don't link the symbols. Mobile builds that touch any of these fail at the `cargo check` stage with `unresolved import` errors, not at runtime.

The standard pattern is to wrap **both the `use tauri::menu::*` import AND the call site** in `#[cfg(desktop)]`. Wrapping only one isn't enough: leaving the top-level `use` outside the cfg gate makes the import itself unresolvable on mobile, even if no call to a menu type executes.

## Why This Matters

A Tauri project that built fine on Linux/macOS/Windows for months will refuse to compile the first time someone runs `cargo tauri ios init && cargo tauri ios dev` if the menu setup isn't gated. The error doesn't name "mobile" — it just says `failed to resolve: could not find Menu in tauri::menu`, which is misleading because the type exists on the same crate version, just behind a feature/cfg that only desktop hosts enable.

This bites every Tauri 2 project the moment mobile work begins. Pre-empting it costs nothing; discovering it during a mobile bring-up costs an audit pass against every menu/tray call site.

## Recognition Pattern

You're about to hit this when any of:
- A Tauri project has shipped desktop-only and is now wiring `cargo tauri ios init` or `cargo tauri android init`.
- `cargo check --target aarch64-apple-ios` or `aarch64-linux-android` fails with `tauri::menu::*` import errors.
- The codebase has `use tauri::{menu::{Menu, MenuItem, ...}, Emitter, Manager};` at module scope and you're adding a mobile target.
- `cargo tauri info` shows desktop+mobile targets configured but the project has never built on either mobile target.

## The Approach

Two-step audit, done before the first mobile build:

1. **Find every `tauri::menu` reference.** `grep -rn "tauri::menu" src-tauri/src/` and `grep -rn "set_menu\|on_menu_event\|tray_handle\|Submenu::\|MenuItem::\|PredefinedMenuItem::"`.
2. **Gate at TWO layers:**
   - The top-level `use` statement: drop `menu::*` from any unconditional `use tauri::{...}` line. Move `use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};` INSIDE the `#[cfg(desktop)]` block that uses it. Re-imports inside a cfg block are scoped to that block — perfectly legal.
   - The call site: wrap the whole menu/tray construction in `#[cfg(desktop)] { ... }`.

Side benefit: per-platform Tauri capabilities (`src-tauri/capabilities/{default,mobile}.json` with `"platforms": [...]`) become trivial after the cfg-gating lands because mobile no longer wants `core:menu:*` permissions and the gate already removed the consumer.

## Example

Before (compiles on desktop, fails on iOS/Android):

```rust
// src-tauri/src/lib.rs
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            let settings_item = MenuItem::with_id(handle, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
            // ... menu construction
            app.set_menu(menu)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("...");
}
```

After (mobile builds clean):

```rust
// src-tauri/src/lib.rs
use tauri::{Emitter, Manager};
// `tauri::menu::*` lives inside the #[cfg(desktop)] block in run() —
// the symbols don't exist on iOS/Android.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
                let handle = app.handle();
                let settings_item = MenuItem::with_id(handle, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
                // ... menu construction
                app.set_menu(menu)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("...");
}
```

## Optional hook scaffold

Add a project pre-commit grep gate at `.git/hooks/pre-commit` (after `git init`) so the mobile-compile-break can't sneak in:

```bash
#!/usr/bin/env bash
# Reject commits that put tauri::menu::* outside a cfg(desktop) block
set -e
if git diff --cached --name-only | grep -q '^src-tauri/src/'; then
  if git diff --cached -U0 src-tauri/src/ | grep -qE '^\+.*use tauri::menu' ; then
    if ! git diff --cached -U10 src-tauri/src/ | grep -B5 'use tauri::menu' | grep -q 'cfg(desktop)'; then
      echo "REJECT: tauri::menu::* added without #[cfg(desktop)] gate. Mobile builds will break." >&2
      exit 1
    fi
  fi
fi
```

## Companion: per-platform capabilities

After the cfg-gating, split `src-tauri/capabilities/`:
- `default.json` — `"platforms": ["linux", "macOS", "windows"]`, keeps `core:menu:default`, `shell:default`, `shell:allow-open`.
- `mobile.json` — `"platforms": ["android", "iOS"]`, omits `core:menu:*` and `shell:*` (a compromised webview content on mobile must not be able to spawn shells).

Same FS scope on both — vault model is identical.
