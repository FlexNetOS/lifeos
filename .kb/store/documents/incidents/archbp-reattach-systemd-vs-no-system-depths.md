---
id: 019f928c-16db-7231-a5ad-deeb4352488a
slug: incidents/archbp-reattach-systemd-vs-no-system-depths
title: "ARCHBP-093 reattach prescribes a systemd user unit — conflicts with NO_SYSTEM_DEPTHS"
type: incident
status: active
priority: high
tags: [archbp, no-system-depths, systemd, brain-build]
---

## Symptom

Found 2026-07-24 during the brain-build baseline: `tests/archbp-093-reattach-unit.spec.ts`
enforces that `planning-spine-v0/docs/lifeos-reattach.service` — a **systemd user unit**
(`WantedBy=default.target`) — exists and matches the `scripts/boot-reattach.mjs unit`
generator output.

## Conflict

The owner's standing critical rule (ICM, applied to the flexnetos_runner persistence
decision and reaffirmed in the brain-build goal) is **NO_SYSTEM_DEPTHS**: no systemd
units at system *or user* scope, no `loginctl` linger; the only sanctioned depth is the
Nix store. ARCHBP-093's mechanism institutionalizes a user-scope systemd unit pattern —
today only as a tested documentation artifact (nothing installs it), but the pattern
points at installation.

## Contained damage / current state

- The stale copy of the unit (worktree-baked ExecStart path) broke the deterministic-emit
  test; regenerated from the main checkout 2026-07-24, spec 3/3 green.
- Release surface is independently protected: brain-build gate G5 greps the release tree
  for `systemd|loginctl` and must return zero.

## Resolution (owned by the archbp lane — do not resolve here)

Choose one, mirroring the settled runner decision (`tasks/gha-runner-nix-native-persistence`:
nix-native persistence or not-at-all):

1. Re-express ARCHBP-093 reattach as a nix-native, session-invoked mechanism (no unit file), or
2. Drop the reattach unit artifact + its spec assertions.

Until resolved, the unit must remain documentation-only: nothing may install or enable it.
