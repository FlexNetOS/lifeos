# YZXCONV-022 — Home Manager under the one foundation install owner (evidence)

Observed 2026-07-21 on the live FlexNetOS host; every receipt below is a real
build or execution, not an assertion.

## Nix evaluation and build receipts

The three governing flake checks build green from the yazelix source
(`origin/main` lineage, worktree `archbp-027-rules-authority` head):

| Check | Store output |
|---|---|
| `home_manager` | `/nix/store/b1zg909wm2vbgncynq1gmwl7iayb7l1f-yzx-home-manager-check` |
| `single_profile_contract` | `/nix/store/rmqlj3h0255avfjsfwlva81qkwby94rf-single-profile-contract-check` |
| `flexnetos_foundation_contracts` | `/nix/store/5l3b8q9wl3mlzvxwd1q685q1gadlvfns-flexnetos-foundation-contracts` |

`home-manager/module.nix` is imported by `flake.nix` (foundation import line)
and exported as `homeManagerModules.default`, making Home Manager a component
of the one foundation element rather than a second owner. The `home_manager`
check encodes the red-test subjects: the default variant must ship `bin/yzx`
and the `Yazelix Nova` desktop entry, the override variant must detect a fake
shadow launcher, the runtime variant must NOT ship a desktop entry, Home
Manager v1 must not generate Yazelix runtime config files as source, and the
store-backed symlink discipline is asserted for generated config.

## Second-profile and shadow-launcher denial

`single_profile_contract` proves `/home/flexnetos/.nix-profile` remains the
sole active owner (no second profile selected), and
`flexnetos_foundation_contracts` proves the foundation closure carries the
mandated toolset without shadow ownership paths.

## Generated runtime matches reviewed inputs

`yzx doctor` (profile-owned binary) reports every runtime component resolved
from the nix store (zellij, mars, yazi opener, pane orchestrator plugin) with
no failures; the codex config/rules provenance gates (`codex_config_provenance`,
`codex_rules_authority`) independently prove the generated runtime files trace
byte-exactly to reviewed profile sources.

## Service ownership

Profile-managed volatile agent state targets
`/run/user/1001/yazelix/profile-runtime` per the path law; the runtime variant
check proves no desktop entry ships for the runtime-only element, so session
start/stop stays with the one foundation owner.
