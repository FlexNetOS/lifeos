# 09 Open Questions

## RFC Questions

1. How should DevWorld map external simulator plugins without turning v0 into a full Mirofish runtime?
2. What should the compiled brainpack format contain beyond role, capability, and decision templates?
3. Should proof URIs be content-addressed only, or allow mutable registry aliases?

## Post-v0 Questions

1. When Odysseus is added, does it act as a task executor, a task source, or both?
2. When Hermes is added, which of its orchestration primitives become first-class task graph edges?
3. How far should company hierarchy modeling go before it dilutes CECCA's v0 responsibility boundary?

## Release Questions

1. Is the Rust toolchain bundled as a relocatable closure inside the release prefix (`toolchains/rust/`), or recorded as build-only provenance? (ARCHBP-029 — decided, see DECIDE-007.)

## Current Default Answers

Until those questions are resolved:

- Mirofish remains adapter-only.
- Brainpacks remain RFC-only.
- Odysseus and Hermes remain out of v0.
- CECCA remains the single internal CEO-agent role.

## Recorded Decisions (owner-ratified v0 defaults)

Recorded 2026-07-13T03:53:34Z by David (owner) ratification. Each is bounded, reversible, and re-openable via the stated unblock RFC.

### DECIDE-001 — DevWorld <-> Mirofish adapter scope (RFC-Q1)
- **Decision:** Mirofish stays adapter-only: DevWorld maps external simulator plugins through a bounded adapter surface and never embeds a full Mirofish runtime in v0.
- **Unblock condition:** A future RFC plus owner sign-off that specifies a bounded Mirofish runtime integration and its resource envelope.
- **Deferral/rollback rule:** Any Mirofish-dependent task reverts to the adapter-only surface; no runtime is introduced without the unblock RFC.

### DECIDE-002 — compiled agent brainpack format (RFC-Q2)
- **Decision:** Brainpacks remain RFC-only in v0: the compiled format carries exactly role, capability, and decision templates and adds no new fields.
- **Unblock condition:** An RFC defining additional brainpack fields (e.g. memory seeds, tool grants) with schema and owner sign-off.
- **Deferral/rollback rule:** Brainpack format reverts to role/capability/decision templates only.

### DECIDE-003 — proof URI addressing model (RFC-Q3)
- **Decision:** Proof URIs are content-addressed only in v0; mutable registry aliases are deferred. Every proof is referenced by its content hash (proof_sha256), never a mutable alias.
- **Unblock condition:** An RFC introducing an alias registry with explicit immutability/audit guarantees and owner sign-off.
- **Deferral/rollback rule:** Aliases are disabled; content-addressing remains the sole canonical proof reference.

### DECIDE-004 — Odysseus role when integrated (POSTV0-Q1)
- **Decision:** Odysseus is out of v0. Its role (task executor, task source, or both) is deferred to a post-v0 integration RFC.
- **Unblock condition:** A post-v0 RFC assigning Odysseus an explicit executor/source role with authority boundaries and owner sign-off.
- **Deferral/rollback rule:** Odysseus is excluded from the v0 task graph and authority model.

### DECIDE-005 — Hermes primitives as task-graph edges (POSTV0-Q2)
- **Decision:** Hermes is out of v0. Which orchestration primitives become first-class task-graph edges is deferred to a post-v0 RFC.
- **Unblock condition:** A post-v0 RFC mapping specific Hermes primitives to task-graph edge types with owner sign-off.
- **Deferral/rollback rule:** Hermes primitives are excluded from the v0 task-graph edge model.

### DECIDE-006 — company hierarchy modeling depth (POSTV0-Q3)
- **Decision:** CECCA remains the single internal CEO-agent role in v0; company hierarchy modeling stays minimal and does not dilute CECCA's responsibility boundary.
- **Unblock condition:** A post-v0 RFC expanding company hierarchy modeling with explicit role boundaries and owner sign-off.
- **Deferral/rollback rule:** Hierarchy modeling reverts to the single CECCA CEO-agent boundary.

### DECIDE-007 — Rust toolchain bundling versus build-only provenance (RELEASE-Q1, ARCHBP-029)

Recorded 2026-07-15T02:29:13Z under owner-delegated bounded mission authority (2026-07-14 delegation); bounded, reversible, evidence and full option matrix in [ARCHBP-029-toolchain-decision.md](1.0_VISION/current_state/ARCHBP-029-toolchain-decision.md).

- **Decision:** Build-only provenance. The Rust toolchain is not bundled into the portable release prefix; `toolchains/rust/` stays unpopulated and the release ledger records rustc/cargo versions, target triple, lockfile hash, and binary checksums in `manifests/provenance.json`. Measured basis: the pinned nu_plugin nightly toolchain closure is 772.8 MiB across 11 store paths with store-RPATH'd glibc/bash (unproven relocation, the ARCHBP-021 blocker), and the deployed prefix never invokes rustc under the blueprint's materialization model.
- **Unblock condition:** An executed relocation proof of a Rust toolchain closure on a clean non-Nix host, owner sign-off on the size budget, license-map coverage for the added GPL/LGPL components, and a named security-update owner for the bundled toolchain.
- **Deferral/rollback rule:** Reopening reverts the release-contract row to QUESTION and re-blocks dependent release tasks; the decision is documentation-only, so rollback is a document revert with no toolchain or profile state changes.
