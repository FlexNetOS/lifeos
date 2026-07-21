# RTK - Rust Token Killer (Codex CLI)

**Usage**: Token-optimized CLI proxy for shell commands.

## Rule — mandatory

RTK is the **mandatory must-use** command frontdoor. Every shell execution begins with the profile-owned `/home/flexnetos/.nix-profile/bin/rtk`; commands that need raw, unfiltered evidence use `rtk proxy <cmd>`. Adoption is verified from the session transcript, not from mere binary availability.

Examples:

```bash
rtk git status
rtk cargo test
rtk npm run build
rtk pytest -q
```

## Meta Commands

```bash
rtk gain            # Token savings analytics
rtk gain --history  # Recent command savings history
rtk proxy <cmd>     # Run raw command without filtering
```

## Verification

```bash
rtk --version
rtk gain
which rtk
```
