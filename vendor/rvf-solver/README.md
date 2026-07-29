# LifeOS-pinned RVF solver

This package is the LifeOS production binding for `@ruvector/rvf-solver`.
The JavaScript ABI glue is retained from the published 0.1.8 package; the
WASM payload is rebuilt from the pinned RuVector source checkout.

- Source repository: `meta/src/meta-ruvector`
- Source revision: `2bb75b2de955c4c1a13cccc2d487ddf4a56d4e9e`
- WASM SHA-256: `27cf1fa341cf8e72bbf5aafd69a81274d2d2506ec3dc4691be527c9007f5c9dd`
- WASM bytes: `171836`
- Target: `wasm32-unknown-unknown`

The artifact is intentionally vendored because the latest registry release
does not contain the pinned source implementation used by the live acceptance
surface. Rebuilds must use the source revision and target above; do not replace
this payload with an unpinned registry download.
