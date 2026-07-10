# Meta Authority Ownership And LifeOS Relocation

Status: owner-corrected architecture, scheduled for preservation-first execution.

Audit date: 2026-07-10.

## Owner Decision

Meta is the sole LifeOS fleet composition, orchestration, and knowledge control
plane. `FlexNetOS/lifeos` is an independent product repository owned by Meta's
project graph. `/home/flexnetos/lifeos` must not become a separate thin
orchestration repository, GitKB root, Git root, agent-policy root, or fleet
manifest owner.

## Source Research

Current upstream heads checked during the audit:

| Repository | Main SHA |
| --- | --- |
| `gitkb/meta` | `4d8adcc7e2b3a684e344180f6698a9a56c81bcc4` |
| `gitkb/meta_core` | `0d5c4b04627ad3212152c96ca572322f7d0c9366` |
| `gitkb/meta_cli` | `70d2405c7ce7c2dde6c398803c10833bf6bc8a98` |
| `gitkb/meta_mcp` | `4d40a4d0148db1b16f521dd55ddb122aed8bd5ad` |

Source conclusions:

1. `gitkb/meta/AGENTS.md` defines Meta as a meta-repo of independent Git
   repositories, not a monorepo.
2. `meta_core::config::find_meta_config` identifies a Meta root by walking
   upward for a regular `.meta`, `.meta.json`, `.meta.yaml`, or `.meta.yml`
   file.
3. `meta_cli` uses the parent directory of the discovered configuration as the
   command root.
4. `MetaConfig.projects` is the fleet membership and dependency authority.
5. The root Cargo workspace coordinates builds, but each member remains an
   independent repository declared in `.meta.yaml`.
6. `.kb` is GitKB state and does not identify a Meta root.

Primary source links:

- <https://github.com/gitkb/meta/blob/4d8adcc7e2b3a684e344180f6698a9a56c81bcc4/AGENTS.md>
- <https://github.com/gitkb/meta/blob/4d8adcc7e2b3a684e344180f6698a9a56c81bcc4/README.md>
- <https://github.com/gitkb/meta/blob/4d8adcc7e2b3a684e344180f6698a9a56c81bcc4/.meta.yaml>
- <https://github.com/gitkb/meta_core/blob/0d5c4b04627ad3212152c96ca572322f7d0c9366/src/config.rs>
- <https://github.com/gitkb/meta_cli/blob/70d2405c7ce7c2dde6c398803c10833bf6bc8a98/src/main.rs>

## Live Conflict

```text
/home/flexnetos/lifeos
|-- AGENTS.md                 competing workspace authority
|-- WORKSPACE_LAYOUT.md       competing canonical-root declaration
|-- .kb/                      empty KB that intercepts root discovery
|-- .git/                     malformed Git marker
|-- lifeos/                   actual FlexNetOS/lifeos product repository
`-- src/meta/                 actual FlexNetOS/meta control plane
```

The parent GitKB contains zero documents and zero commits but has a derived
56,304-symbol code index. The populated Meta KB contains the project context and
control-plane task history. The home Codex instruction chain also delegated
sessions to the competing parent `AGENTS.md`.

## Correct Target

```text
/home/flexnetos/meta/        sole Meta control-plane Git root
|-- .meta.yaml               sole fleet composition authority
|-- .kb/                     populated Meta knowledge/control plane
|-- lifeos/                  Meta-owned LifeOS product peer
|-- src/
|   |-- envctl/              Meta-owned environment peer
|   |-- yazelix/             Meta-owned foundation peer
|   |-- flexnetos_runner/    Meta-owned release/provenance peer
|   `-- other independent peers
|-- var/, artifacts/         ignored operational/evidence data
`-- Meta tracked source and internal component repositories
```

The final Meta manifest must include the LifeOS product repository:

```yaml
projects:
  lifeos:
    repo: git@github.com:FlexNetOS/lifeos.git
    path: lifeos
```

No second root `.meta.yaml`, `.kb`, Git repository, or active agent policy may
remain at the old `/home/flexnetos/lifeos` name.

## Preservation Findings

| Surface | Pre-migration state |
| --- | --- |
| LifeOS repository | `5.7G`, clean `main` after PR #21, origin `FlexNetOS/lifeos` |
| Meta repository | clean `main` after PR #99, origin `FlexNetOS/meta`, upstream `gitkb/meta` |
| Parent KB | zero documents, zero commits, 56,304 derived symbols |
| Parent Git marker | directory exists but is not a valid Git repository |
| Parent source tree | about `331G`; must be migrated by provenance, not deleted |
| Parent `var/` | about `110G`; operational/evidence state, not identity |
| Parent worktrees | about `15G`; require per-repository ownership checks |

All dirty LifeOS work was published through PR #21 before structural mutation.
The stale Meta lockfile and stash were archived. Stale failing Meta PR #97 was
archived and closed rather than merged.

## Scheduled Execution

| Order | Task | Required result |
| ---: | --- | --- |
| 1 | `STRUCTURE-001` | Atomically rename `/home/flexnetos/lifeos` to `/home/flexnetos/meta`. |
| 2 | `STRUCTURE-002` | Prove LifeOS is preserved at `/home/flexnetos/meta/lifeos`. |
| 3 | `STRUCTURE-003` | Promote the existing `src/meta` checkout into the Meta root. |
| 4 | `STRUCTURE-004` | Archive collisions and retire former parent shadow names. |
| 5 | `STRUCTURE-005` | Register LifeOS and correct peers in the one Meta manifest. |
| 6 | `STRUCTURE-006` | Query/diff names and prove all consumers and GitHub states. |

## Non-Negotiable Gates

- Archive before move, restore, removal, or path rewrite.
- Preserve Git objects, refs, remotes, reflogs, worktree metadata, dirty files,
  permissions, and byte counts.
- No reclone over existing source.
- No history rewrite or reset.
- No generated Yazelix runtime edits.
- No unapproved GitKB cloud remote.
- Parent data is retained until an owning migration classifies it.
- Final state has one Meta manifest, one Meta KB, one control-plane instruction
  chain, and no stale parent identity.

## Rollback

Each move must have a checksummed receipt containing source and destination
paths, device and inode data, Git refs, worktree metadata, file counts, byte
counts, and consumer rewrites. Rollback reverses moves in dependency order and
restores archived consumers before restarting any affected runtime.
