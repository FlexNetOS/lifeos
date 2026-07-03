# Current State Map

Status: complete
Observed at: 2026-07-03T18:30:22Z

## Package context
- Package path: /home/flexnetos/FlexNetOS/src/lifeos/planning-spine-v0
- Git root: /home/flexnetos/FlexNetOS/src/lifeos
- Branch: main
- HEAD: 48a0f0c
- Worktree status sample:  M ../package.json | ?? ./ | ?? ../scripts/verify-planning-spine.mjs

## Workspace findings
- /home/flexnetos/FlexNetOS is present on disk but is not itself a git repository.
- Canonical relevant repos were observed under src/, including lifeos, meta, meta-plugins, envctl, flexnetos_runner, hermes-agent, teri, yazelix, meta-hardware, meta-ruvector, rtk-tokenkill, and meta_plugin_protocol.
- Generated or nested repo surfaces were also observed under flexnetos_runner/_work and teri/.worktrees; these were summarized instead of dumped recursively.

## Drift findings
- src/lifeos is dirty outside this task scope: package.json modified, planning-spine-v0 untracked, scripts/verify-planning-spine.mjs untracked.
- flexnetos_runner has heavy mutable state under _work plus a deleted .codex/hooks.json entry in its worktree status sample.
- PATH includes /home/flexnetos/FlexNetOS/usr/bin before /usr/bin, so workspace wrappers can shadow host tools.
- /nix/store contains 24k+ entries; relevant hits skew heavily toward Yazelix-named derivations in the sampled slice.
- Odysseus was observed as docs/manifests/scripts under envctl-family repos, not as a top-level git repo in the scanned paths.
- Mirofish presence was observed via the local RFC in this package and the nested teri external-source worktree mirofish-guide.

## Relevant repos
- /home/flexnetos/FlexNetOS/src/lifeos [canonical] branch=main head=48a0f0c dirty=3 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/meta [canonical] branch=codex/lifeos-portable-release-roadmap head=b9a1131 dirty=0 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/meta-plugins [canonical] branch=codex/codex-marketplace-routing-20260703 head=e2d3749 dirty=0 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/envctl [canonical] branch=codex/catalog-clean-env-audit-20260703 head=391d2d5 dirty=0 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/flexnetos_runner [canonical] branch=main head=50c6b63 dirty=46 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/hermes-agent [canonical] branch=main head=4e9341a71 dirty=0 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/teri [canonical] branch=codex/archive-repo-local-codex-hooks-20260703 head=b65b832 dirty=0 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/yazelix [canonical] branch=codex/use-local-beads-rust-source head=da74afdc dirty=0 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/meta-hardware [canonical] branch=main head=9fb636e dirty=0 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/meta-ruvector [canonical] branch=main head=d8cb103b dirty=0 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/rtk-tokenkill [canonical] branch=codex/register-gitkb-scaffold head=e9d7b27 dirty=0 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/meta_plugin_protocol [canonical] branch=detached-or-unknown head=22c5e61 dirty=0 upstream_ahead=n/a upstream_behind=n/a
- /home/flexnetos/FlexNetOS/src/flexnetos_runner/_work/actions-runner-01-work/envctl/envctl [generated_runner_mirror] branch=detached-or-unknown head=e24b7fb dirty=0 upstream_ahead=n/a upstream_behind=n/a
- /home/flexnetos/FlexNetOS/src/flexnetos_runner/_work/actions-runner-01-work/meta/meta [generated_runner_mirror] branch=main head=e2f9483 dirty=3 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/flexnetos_runner/_work/actions-runner-02-work/envctl/envctl [generated_runner_mirror] branch=detached-or-unknown head=f16108d dirty=0 upstream_ahead=n/a upstream_behind=n/a
- /home/flexnetos/FlexNetOS/src/flexnetos_runner/_work/actions-runner-02-work/meta/meta [generated_runner_mirror] branch=main head=e2f9483 dirty=3 upstream_ahead=0 upstream_behind=0
- /home/flexnetos/FlexNetOS/src/teri/.worktrees/issue-86-source-wires/.worktrees/external-sources/mirofish-guide [nested_worktree] branch=main head=420bd02 dirty=0 upstream_ahead=0 upstream_behind=0

## Noisy surfaces summarized
- /home/flexnetos/FlexNetOS/src/flexnetos_runner/_work: generated runner mirrors, caches, logs, and mutable runner-home state.
- /home/flexnetos/FlexNetOS/src/teri/.worktrees: nested worktrees for external sources, including mirofish-guide.
- /nix/store: very large vendor store, sampled by relevant-name hits only.
- /usr/bin: large host tool surface, summarized by counts and overlay relationship.

## Artifact notes
- state/tree_snapshot.txt is a concise package tree snapshot rather than a recursive dump of noisy external surfaces.
- JSON artifacts were generated from observed command outputs and sanitized to avoid secret leakage.

## Runtime reverification update
- Reverified at: 2026-07-03T19:12:53Z
- Package verifier: `bun run planning-spine:verify` -> `planning-spine-v0 verification passed`.
- Ambient shell drift: bare `codex` resolves to `/nix/store/iv68194hlnmc7msgpksss6nag4c56gya-yazelix-flexnetos-foundation/toolbin/codex` and reports `codex-cli 0.143.0-alpha.34`.
- Clean frontdoor remains repaired: `/home/flexnetos/.local/bin/codex -> /home/flexnetos/.nix-profile/bin/codex -> /nix/store/gh9ccwvjxnv0lhi8h6xc1ganabadrpqi-codex-cli-0.143.0-alpha.35/bin/codex`, and clean PATH reports `codex-cli 0.143.0-alpha.35`.
- Scope guard honored: this refresh wrote only `state/**` and `proof_records/LPS-019.proof.json`.

