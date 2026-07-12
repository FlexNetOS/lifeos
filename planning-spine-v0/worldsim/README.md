# worldsim — Nix USD toolchain dev shell (LPS-030)

A hermetic Nix dev shell that provides the OpenUSD Python API, the
`usdchecker` / `usdcat` / `usdzip` command-line tools, and a headless MeshLab
so the worldsim ingestion pipeline (LPS-029..036) runs reproducibly on the
workstation without mutating the system nix profile or `~/.local`.

## What it provides

| Tool | Package | Purpose |
|------|---------|---------|
| `usdchecker` | `openusd` | Validate USD stages (twin-acceptance gate, LPS-035) |
| `usdcat` | `openusd` | Convert / flatten USD layers (LPS-033) |
| `usdzip` | `openusd` | Package USDZ archives |
| OpenUSD Python API (`pxr`) | `openusd` | Programmatic USD composition (LPS-033/034) |
| `meshlab` | `meshlab` | GUI + headless (`--help`, offscreen Qt) mesh tooling |
| `pymeshlab` | `python3Packages.pymeshlab` | Scripted, headless MeshLab engine — runs the `.mlx` filter scripts (LPS-031) that the removed `meshlabserver` binary used to |

Modern MeshLab (2020+) dropped the standalone `meshlabserver` executable; the
headless equivalent is **pymeshlab**, which loads the same `.mlx` filter scripts
from Python with `QT_QPA_PLATFORM=offscreen`. The shell exports that variable so
mesh operations run without a display.

## Pinning

`nixpkgs` is pinned in `flake.lock` to revision
`b5aa0fbd538984f6e3d201be0005b4463d8b09f8`. That revision's `openusd`,
`meshlab`, and `pymeshlab` derivations are available from the configured
substituters (`cache.nixos.org`), so `nix develop` substitutes prebuilt
binaries instead of triggering a multi-hour OpenUSD source build.

Versions at this pin: OpenUSD **26.03**, MeshLab **2025.07**, pymeshlab
**2025.7.post1**.

## Usage

Because the flake lives inside a larger git repo and its files may be
uncommitted, address it with the `path:` prefix so Nix treats it as a plain
directory rather than a git subtree:

```bash
NIX=/nix/var/nix/profiles/default/bin/nix
WS=path:planning-spine-v0/worldsim

# Enter the shell
$NIX develop "$WS"

# Or run a single gate command
$NIX develop "$WS" -c usdchecker --help
$NIX develop "$WS" -c usdcat --help
$NIX develop "$WS" -c usdzip --help
$NIX develop "$WS" -c meshlab --help
$NIX develop "$WS" -c python3 -c "import pymeshlab; pymeshlab.MeshSet()"
```

## Gate (LPS-030)

`nix develop` runs `usdchecker`, `usdcat`, `usdzip`, and headless MeshLab with
exit 0; versions are pinned in `flake.lock`. Proof:
`planning-spine-v0/proof_records/LPS-030.proof.json`.

## Rollback

This dev shell is self-contained: delete `worldsim/` (or run
`nix flake` against a different path). No system mutation — the user's
`nix profile` is untouched (verify with `nix profile list`).
