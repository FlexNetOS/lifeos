# ARCHBP-029 — Rust toolchain bundling versus build-only provenance

- **Task:** ARCHBP-029 (phase 13-foundation-gap-closure; parents FOUNDATION-001, RELEASE-002)
- **Recorded:** 2026-07-15T02:29:13Z (UTC), revision 1
- **Authority:** owner-delegated bounded decision (mission delegation of routine
  approvals, 2026-07-14); reversible via the unblock condition below
- **Decision id:** DECIDE-007 (ledger entry in [09_OPEN_QUESTIONS.md](../../09_OPEN_QUESTIONS.md))
- **Status:** decided — build-only provenance

## Question

Is the Rust toolchain bundled as a relocatable closure inside the portable
release prefix (`toolchains/rust/`), or recorded as build-only provenance?
Source of the open question: `docs/lifeos-toolchain-and-dependency-bundle.md:19`
(meta repo, row status QUESTION) and
[FOUNDATION_META_PORTABILITY_MODEL.md](../FOUNDATION_META_PORTABILITY_MODEL.md) §7.

## Measured evidence (real command outputs, 2026-07-15)

The reproducibility-proof toolchain is the one pinned by the nu_plugin flake
(`/home/flexnetos/meta/src/nu_plugin/flake.nix:135`,
`rust-bin.selectLatestNightlyWith (t: t.default)` via oxalica rust-overlay).

Lock pins (`nu_plugin/flake.lock`):

| Input | rev | date |
|---|---|---|
| nixpkgs | `b5aa0fbd538984f6e3d201be0005b4463d8b09f8` | 2026-06-29 |
| rust-overlay | `a286e5b998e852297a403786f063fb2c9fe7f57a` | 2026-07-12 |

Current lock evaluates (`nix eval --raw --impure --expr 'let f =
builtins.getFlake "path:/home/flexnetos/meta/src/nu_plugin"; pkgs = import
f.inputs.nixpkgs { system = "x86_64-linux"; overlays = [
f.inputs.rust-overlay.overlays.default ]; }; in
(pkgs.rust-bin.selectLatestNightlyWith (t: t.default)).outPath'`) to
`/nix/store/dasjsxnh9pswbyx18ry5wc94mbqvv2kg-rust-default-1.99.0-nightly-2026-07-12`,
which is **not realized** on this host (`nix path-info` → "path … is not
valid"); realizing it would be a new toolchain download, a blocked path for
this decision task. The measured instance is therefore the realized
same-profile nightly used by the prior compiler-proof runs:

```
$ nix path-info -rsSh /nix/store/a87wja4nf0mja8jwq39wnhw0m6104790-rust-nightly-latest-with-std-2026-05-31
/nix/store/bf6wgamqnl3c91iamlb1branrfcwwy7x-libunistring-1.4.2                        2.0 MiB    2.0 MiB
/nix/store/6qa00czc79b3nb6ld0mdyacfp2p1k3jx-libidn2-2.3.8                           359.5 KiB    2.3 MiB
/nix/store/g54b6ghpnn98hfdz4yqw87w10c3hx8bv-xgcc-15.2.0-libgcc                      193.0 KiB  193.0 KiB
/nix/store/57iz36553175g3178pvxjij8z5rcsd4n-glibc-2.42-61                            33.5 MiB   36.0 MiB
/nix/store/5s4ch5i5n50rgqp08qafq05zz2hk69x0-rust-std-nightly-latest-2026-05-31      161.4 MiB  161.4 MiB
/nix/store/61a1nwx3w6rqyaisj5rn1sal1981apm7-zlib-1.3.2                              129.5 KiB   36.1 MiB
/nix/store/xyikkpwkyxx6syba3kfrr0h67ig5hwmn-gcc-15.2.0-libgcc                       193.1 KiB  193.1 KiB
/nix/store/chqq8mpmpyfi9kgsngya71akv5xicn03-gcc-15.2.0-lib                            9.8 MiB   46.0 MiB
/nix/store/gik3rh1vz2jlgnifb9dh6vc6sxwwz9jj-bash-5.3p9                                1.8 MiB   37.8 MiB
/nix/store/9k0wd77pl8cw684cycb17gjx8zycrk0s-rustc-nightly-latest-2026-05-31         395.7 MiB  443.6 MiB
/nix/store/a87wja4nf0mja8jwq39wnhw0m6104790-rust-nightly-latest-with-std-2026-05-31 167.7 MiB  772.8 MiB
```

- **Closure size: 772.8 MiB across 11 store paths** (`du -sh` on the root
  path alone: 169M). Stable-channel comparison:
  `rust-stable-with-std-2026-05-28` closure = **758.0 MiB** — the cost is
  channel-independent.
- The closure includes host-runtime libraries (glibc 2.42, gcc-15.2.0-lib,
  bash 5.3, zlib, libidn2, libunistring) whose store paths are hard RPATH
  targets of the rustc binaries — the exact `/nix/store` relocation problem
  ("Store Trap") the blueprint's musl strategy exists to avoid.
- **Licensing** (`rustc …/share/doc/rust/licenses/`): the distribution ships
  12 license texts — Apache-2.0, MIT (the toolchain's own dual license),
  BSD-2-Clause, CC-BY-SA-4.0, GCC-exception-3.1, GPL-2.0-only,
  GPL-3.0-or-later, ISC, LLVM-exception, NCSA, OFL-1.1, Unicode-3.0.
  Bundling additionally distributes glibc (LGPL-2.1+), bash (GPL-3.0+), and
  gcc runtime libs (GPL-3.0+ with GCC-exception-3.1), all of which must enter
  `manifests/license-map.json`; missing license data blocks release
  publication (`lifeos-toolchain-and-dependency-bundle.md:94`).

## Decision matrix

| Consequence | Option A — relocatable Rust closure in `toolchains/rust/` | Option B — build-only provenance |
|---|---|---|
| Size | +772.8 MiB / +11 store paths per release artifact (nightly; stable 758.0 MiB) | +0; provenance rows only (`manifests/provenance.json`) |
| Licensing | Adds GPL-3.0+ (bash, gcc libs), LGPL-2.1+ (glibc), CC-BY-SA-4.0 docs to the distributed artifact; 12+ texts to the license map | Apache-2.0/MIT obligations attach to shipped *binaries* only; toolchain licenses stay in the build plane |
| Offline rebuild | In-prefix rebuild possible on the target host (the only capability A adds) | Rebuild requires the Nix-owned build plane: pinned `flake.lock` + `sources/{crates,npm,git}` snapshots; offline once the pinned inputs are cached |
| Security updates | Toolchain CVE ⇒ re-issue every release artifact (772.8 MiB churn each) | Toolchain CVE ⇒ bump the pin, rebuild, publish binaries; artifact size unchanged |
| Rollback | Prefix rollback must transact the toolchain subtree too | Rollback = binary/manifest swap; toolchain state never lives in the prefix |
| Host dependency | None at runtime, but only after an unproven relocation of glibc/bash-RPATH'd closures — the same blocker gating Yazelix (ARCHBP-021) | Build hosts need Nix (accepted temporary downgrade, `lifeos-toolchain-and-dependency-bundle.md:57-67`); the shipped prefix needs no toolchain at all |
| Relocation proof burden | Doubles ARCHBP-021: runtime closure *and* toolchain closure must be proven relocatable | Confined to the runtime closure; rustc never needs relocation proof |

## Decision (DECIDE-007)

- **Decision:** **Build-only provenance.** The Rust toolchain is *not* bundled
  into the portable release prefix. `toolchains/rust/` is not populated; the
  bundle-inventory row flips from QUESTION to provenance-only. The release
  ledger records rustc/cargo versions, target triple, lockfile hash, and
  binary checksums (`lifeos-toolchain-and-dependency-bundle.md:42-43`) into
  `manifests/provenance.json` / `manifests/sbom.json`.
  - *Provenance and update ownership:* the Nix-owned build plane. Each peer
    owns its pin (`rust-toolchain.toml` / flake.lock, per
    [FOUNDATION_META_PORTABILITY_MODEL.md](../FOUNDATION_META_PORTABILITY_MODEL.md)
    §6: meta owns policy + ledger, peers own pins); the Release Agent owns
    recording those pins into the release manifests and bumping them for
    security updates.
  - *Offline expectation:* the shipped prefix is toolchain-free and fully
    functional offline at runtime. Offline **rebuild** is a build-plane
    capability: pinned flake inputs plus `sources/` snapshots must be cached;
    it is explicitly *not* a shipped-prefix capability.
  - *Relocation expectation:* no relocation proof is required for rustc/cargo.
    ARCHBP-021's relocation burden covers only the runtime closure (Yazelix
    tools + release binaries).
  - *Rationale:* the blueprint's materialization model compiles at the
    Nix-owned build plane and ships static-musl artifacts — the deployed
    prefix never invokes rustc; ARCHITECTURE_BLUEPRINT_COMPATIBILITY
    correction 6 ("Nix ownership is the current reproducibility proof") makes
    the pinned-Nix build plane the proven mechanism today, while closure
    relocation remains unproven; and the measured 772.8 MiB closure with
    store-RPATH'd glibc/bash would import the unsolved Store-Trap problem
    into every release artifact for a rebuild capability no release task
    requires.
- **Unblock condition:** reopen toward Option A (or an explicitly bounded
  hybrid with a single named owner) only when **all** of: (1) an executed
  relocation proof of a Rust toolchain closure on a clean non-Nix host
  (extracted closure, patchelf, or wrapper — the ARCHBP-021 method set);
  (2) owner sign-off on a ≥772.8 MiB artifact size budget; (3) license-map
  coverage for the added GPL/LGPL/CC components; (4) a named security-update
  owner for the bundled toolchain.
- **Deferral/rollback rule:** reopening reverts the release contract row to
  QUESTION, re-blocks dependent release tasks, and keeps this record as the
  prior state; the decision itself changes no toolchain or profile state in
  either direction (documentation-only), so rollback is a document revert.

## Effects on dependent tasks and contracts

- **ARCHBP-021** (prove full-stack Yazelix musl and portable-closure release):
  scope is *narrowed* — the musl/portable-closure proof excludes rustc/cargo
  bundling; only the runtime closure needs relocation or static-musl proof.
- **Release tasks** (RELEASE-002 family and downstream ARCHBP release tasks):
  must not assume an in-prefix toolchain; any task that wants in-prefix
  compilation is blocked on the unblock condition above.
- **Release contract update:** meta repo
  `docs/lifeos-toolchain-and-dependency-bundle.md:19` ("toolchains/rust/ or
  build-only provenance — QUESTION") and the `toolchains/rust/` row of
  `docs/lifeos-release-filesystem-layout.md` are superseded by this record
  (planning-spine decision outranks raw contract prose per the truth order).
  The in-place annotation of those meta-repo files is a follow-up: the task
  row's allowed path `/home/flexnetos/meta/src/meta/docs/**` does not exist on
  disk (the meta docs live at the meta workspace root), so the annotation
  requires its own change in that repo referencing DECIDE-007.
- **Gate check:** `planning-spine-v0/scripts/check-archbp-029-decision.mjs`
  asserts every verification-gate clause of the ARCHBP-029 row against this
  record and its cross-references.
