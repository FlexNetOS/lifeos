---
id: lifeos.task-tables.nu-plugin-static-wiki
title: nu_plugin Task Handoff Static Wiki
type: derived-task-view
status: review-only
source_commit: c84740532ded2a27ee283ea7a3a5f303eaeb61a7
related:
  - "[[planning-spine-v0/task_tables/README]]"
  - "[[planning-spine-v0/task_tables/canonical/task_graph.normalized]]"
---

# nu_plugin Task Handoff Static Wiki

Derived from canonical WorkOrders. Upstream completion is provenance; every local task remains review-only and pending human approval.

| Task | Title | Phase | Source status | Local status | Approval | Dependencies |
|---|---|---|---|---|---|---|
| TASK-CDB000 | Initialize execution package | package | complete | review | pending |  |
| TASK-CDB001 | Create AI navigation graph | package | complete | review | pending | TASK-CDB000 |
| TASK-CDB002 | Create readiness and stop gates | package | complete | review | pending | TASK-CDB000 |
| TASK-CDB003 | Create task graph and task-file map | package | complete | review | pending | TASK-CDB000 |
| TASK-CDB004 | Create command ledger and worklog | package | complete | review | pending | TASK-CDB000 |
| TASK-CDB005 | Generate manifest, checksums, link report | package | complete | review | pending | TASK-CDB001; TASK-CDB003; TASK-CDB004 |
| TASK-CDB006 | Write architecture document | docs | complete | review | pending | TASK-CDB005 |
| TASK-CDB007 | Write schema document | docs | complete | review | pending | TASK-CDB006 |
| TASK-CDB008 | Write command reference | docs | complete | review | pending | TASK-CDB006 |
| TASK-CDB009 | Write integration contracts | docs | complete | review | pending | TASK-CDB006 |
| TASK-CDB010 | Write security and unsafe capture policies | docs | complete | review | pending | TASK-CDB006 |
| TASK-CDB011 | Write compatibility bridge docs | docs | complete | review | pending | TASK-CDB009 |
| TASK-CDB012 | Write test and fixture matrix | docs | complete | review | pending | TASK-CDB007 |
| TASK-CDB013 | Create Rust workspace skeleton | workspace | complete | review | pending | TASK-CDB006; TASK-CDB068 |
| TASK-CDB014 | Implement codedb-core schemas | core | complete | review | pending | TASK-CDB013; TASK-CDB007 |
| TASK-CDB015 | Implement redb store init | store | complete | review | pending | TASK-CDB014 |
| TASK-CDB016 | Implement redb schema version, locks, backup, restore | store | complete | review | pending | TASK-CDB015 |
| TASK-CDB017 | Implement filesystem scanner | scan | complete | review | pending | TASK-CDB014; TASK-CDB015 |
| TASK-CDB018 | Implement exact source metadata and blob policy | scan | complete | review | pending | TASK-CDB017 |
| TASK-CDB019 | Implement cargo metadata capture | cargo | complete | review | pending | TASK-CDB014; TASK-CDB015 |
| TASK-CDB020 | Implement Cargo source provenance capture | cargo | complete | review | pending | TASK-CDB019 |
| TASK-CDB021 | Implement cfg/feature/target/toolchain context | context | complete | review | pending | TASK-CDB019 |
| TASK-CDB022 | Implement static Rust item inventory | rust-static | complete | review | pending | TASK-CDB018; TASK-CDB021 |
| TASK-CDB023 | Implement macro_rules static inventory | rust-static | complete | review | pending | TASK-CDB022 |
| TASK-CDB024 | Implement proc-macro static detection and gaps | rust-static | complete | review | pending | TASK-CDB022 |
| TASK-CDB025 | Implement build.rs static detection and gaps | rust-static | complete | review | pending | TASK-CDB022 |
| TASK-CDB026 | Implement static include/path edge detection | rust-static | complete | review | pending | TASK-CDB022 |
| TASK-CDB027 | Implement native/linker static/gap rows | native | complete | review | pending | TASK-CDB025 |
| TASK-CDB028 | Implement no-mutation proof | proof | complete | review | pending | TASK-CDB017 |
| TASK-CDB029 | Implement codedb CLI scan/export/schema | cli | complete | review | pending | TASK-CDB015; TASK-CDB017; TASK-CDB019; TASK-CDB022 |
| TASK-CDB030 | Implement Nushell plugin commands | nu-plugin | complete | review | pending | TASK-CDB029 |
| TASK-CDB031 | Implement doctor checks | doctor | complete | review | pending | TASK-CDB029; TASK-CDB030 |
| TASK-CDB032 | Implement bounded read-only MCP server | mcp | complete | review | pending | TASK-CDB029 |
| TASK-CDB033 | Implement unsafe build capture gate scaffold | unsafe | complete | review | pending | TASK-CDB025; TASK-CDB032 |
| TASK-CDB034 | Implement optional build/proc-macro raw log capture | unsafe | complete | review | pending | TASK-CDB033 |
| TASK-CDB035 | Implement envctl export contract | exports | complete | review | pending | TASK-CDB029 |
| TASK-CDB036 | Implement meta repo selection inputs | integration | complete | review | pending | TASK-CDB029 |
| TASK-CDB037 | Implement Codex bridge docs and sample MCP config | integration | complete | review | pending | TASK-CDB032 |
| TASK-CDB038 | Implement Yazelix placement docs | integration | complete | review | pending | TASK-CDB031 |
| TASK-CDB039 | Implement runner proof contract | integration | complete | review | pending | TASK-CDB028; TASK-CDB029; TASK-CDB032 |
| TASK-CDB040 | Implement GitKB/RTK/Kache/wild/Fenix docs | integration | complete | review | pending | TASK-CDB009 |
| TASK-CDB041 | Create fixture matrix | fixtures | complete | review | pending | TASK-CDB012; TASK-CDB013 |
| TASK-CDB042 | Add deterministic scan tests | tests | complete | review | pending | TASK-CDB041; TASK-CDB029 |
| TASK-CDB043 | Add security/no-leak tests | tests | complete | review | pending | TASK-CDB041; TASK-CDB032 |
| TASK-CDB044 | Add no-mutation tests | tests | complete | review | pending | TASK-CDB028; TASK-CDB041 |
| TASK-CDB045 | Add unsafe capture tests | tests | complete | review | pending | TASK-CDB033; TASK-CDB034; TASK-CDB041 |
| TASK-CDB046 | Run full local validation | release | complete | review | pending | TASK-CDB042; TASK-CDB043; TASK-CDB044; TASK-CDB045 |
| TASK-CDB047 | Generate release manifest | release | complete | review | pending | TASK-CDB046 |
| TASK-CDB048 | Prepare handoff and backlog | release | complete | review | pending | TASK-CDB047 |
| TASK-CDB049 | Inspect Yazelix Nushell runtime bridge | yazelix-nu | complete | review | pending | TASK-CDB038 |
| TASK-CDB050 | Package nu_plugin_codedb as runtime tool | packaging | complete | review | pending | TASK-CDB049; TASK-CDB030 |
| TASK-CDB051 | Validate host Nu vs Yazelix runtime Nu protocol | compat | complete | review | pending | TASK-CDB050 |
| TASK-CDB052 | Implement transient nu --plugins smoke test | nu-plugin | complete | review | pending | TASK-CDB051 |
| TASK-CDB053 | Implement temp-HOME plugin registry smoke test | nu-plugin | complete | review | pending | TASK-CDB051 |
| TASK-CDB054 | Generate CodeDB extern/init bridge artifact | yazelix-init | complete | review | pending | TASK-CDB050; TASK-CDB052 |
| TASK-CDB055 | Verify generated initializer checksums/provenance | provenance | complete | review | pending | TASK-CDB054 |
| TASK-CDB056 | Extend syntax validator path for CodeDB fixtures | syntax | complete | review | pending | TASK-CDB054 |
| TASK-CDB057 | Add no-real-HOME plugin registration test | safety | complete | review | pending | TASK-CDB053 |
| TASK-CDB058 | Add Yazelix launch smoke with CodeDB disabled | yazelix-smoke | complete | review | pending | TASK-CDB049; TASK-CDB056 |
| TASK-CDB059 | Add Yazelix launch smoke with CodeDB enabled | yazelix-smoke | complete | review | pending | TASK-CDB058; TASK-CDB054 |
| TASK-CDB060 | Add plugin stderr/trace secret-leak guard | security | complete | review | pending | TASK-CDB052; TASK-CDB032 |
| TASK-CDB061 | Add redb lock/plugin-GC behavior test | storage | complete | review | pending | TASK-CDB014; TASK-CDB050 |
| TASK-CDB062 | Add Codex bounded CLI/MCP invocation smoke | codex | complete | review | pending | TASK-CDB032; TASK-CDB060 |
| TASK-CDB063 | Add envctl table rows for CodeDB runtime integration | envctl | complete | review | pending | TASK-CDB035; TASK-CDB055 |
| TASK-CDB064 | Verify ZIP extraction proof before construction | package | complete | review | pending | TASK-CDB005 |
| TASK-CDB065 | Upgrade controlled task graph table and Markdown projection | package | complete | review | pending | TASK-CDB064 |
| TASK-CDB066 | Complete checklist evidence map | package | complete | review | pending | TASK-CDB065 |
| TASK-CDB067 | Validate and seal final execution package | package | complete | review | pending | TASK-CDB066 |
| TASK-CDB068 | Repair TASK_GRAPH CSV source-of-truth file linkage | package-repair | complete | review | pending | TASK-CDB067 |
| TASK-CDB069 | Complete audit upgrade hardening without downgrades | audit-upgrade | complete | review | pending | TASK-CDB068 |
| TASK-CDB070 | Evidence audit and drift repair | Phase 0 | complete | review | pending | TASK-CDB069 |
| TASK-CDB071 | Read-only foundation hardening | Phase 1 | complete | review | pending | TASK-CDB070 |
| TASK-CDB072 | Lossless round-trip artifact generation | Phase 2 | complete | review | pending | TASK-CDB071 |
| TASK-CDB073 | Change-plan graph without apply | Phase 3 | complete | review | pending | TASK-CDB072 |
| TASK-CDB074 | Patch generation into isolated worktrees | Phase 4 | complete | review | pending | TASK-CDB073 |
| TASK-CDB075 | Operator-approved apply gate | Phase 5 | complete | review | pending | TASK-CDB074 |
| TASK-CDB076 | Bidirectional sync semantics | Phase 6 | complete | review | pending | TASK-CDB075 |
| TASK-CDB077 | Macro expansion beyond static inventory | Gap Closure | complete | review | pending | TASK-CDB071 |
| TASK-CDB078 | Proc-macro execution gate | Gap Closure | complete | review | pending | TASK-CDB071 |
| TASK-CDB079 | Build-script execution gate | Gap Closure | complete | review | pending | TASK-CDB071 |
| TASK-CDB080 | Generated OUT_DIR artifact reproduction | Gap Closure | complete | review | pending | TASK-CDB079 |
| TASK-CDB081 | Symlink and platform materialization limits | Gap Closure | complete | review | pending | TASK-CDB072 |
| TASK-CDB082 | Native and linker dynamic facts | Gap Closure | complete | review | pending | TASK-CDB079 |
| TASK-CDB083 | MCP raw source and blob reads blocked | Gap Closure | complete | review | pending | TASK-CDB071 |
| TASK-CDB084 | Stable anonymous and unstable syntax identity | Gap Closure | complete | review | pending | TASK-CDB072 |
| TASK-CDB085 | Semantic and public API hashing | Gap Closure | complete | review | pending | TASK-CDB084 |
| TASK-CDB086 | Store migrations and schema evolution | Gap Closure | complete | review | pending | TASK-CDB072 |
| TASK-CDB087 | Source drift versus stored plans | Gap Closure | complete | review | pending | TASK-CDB073 |
| TASK-CDB088 | Failed materialization and apply recovery | Gap Closure | complete | review | pending | TASK-CDB075 |
| TASK-CDB089 | Operator approval and manual decision provenance | Gap Closure | complete | review | pending | TASK-CDB075 |
| TASK-CDB090 | Final bidirectional release gate and manifest reseal | Release Gate | complete | review | pending | TASK-CDB070; TASK-CDB071; TASK-CDB072; TASK-CDB073; TASK-CDB074; TASK-CDB075; TASK-CDB076; TASK-CDB077; TASK-CDB078; TASK-CDB079; TASK-CDB080; TASK-CDB081; TASK-CDB082; TASK-CDB083; TASK-CDB084; TASK-CDB085; TASK-CDB086; TASK-CDB087; TASK-CDB088; TASK-CDB089 |
| TASK-CDB091 | Research current polyglot parsing/indexing/tooling landscape | planning | complete | review | pending |  |
| TASK-CDB092 | Design polyglot schema extension | planning | complete | review | pending | TASK-CDB091 |
| TASK-CDB093 | Implement language detection and package marker inventory | planning | complete | review | pending | TASK-CDB091 |
| TASK-CDB094 | Implement raw whole-repo byte/blob import fixtures | planning | complete | review | pending | TASK-CDB091 |
| TASK-CDB095 | Add Tree-sitter/ast-grep parser-backed summary prototype | planning | complete | review | pending | TASK-CDB091 |
| TASK-CDB096 | Add Python import surface fixture plan | planning | complete | review | pending | TASK-CDB093 |
| TASK-CDB097 | Add Ruby import surface fixture plan | planning | complete | review | pending | TASK-CDB093 |
| TASK-CDB098 | Add TypeScript/JavaScript import surface fixture plan | planning | complete | review | pending | TASK-CDB093 |
| TASK-CDB099 | Add Go/Shell/Nix/config import surface fixture plan | planning | complete | review | pending | TASK-CDB093 |
| TASK-CDB100 | Design single-binary Rust export crate generator | planning | complete | review | pending | TASK-CDB091 |
| TASK-CDB101 | Prototype generated export crate verify/list/materialize commands | planning | complete | review | pending | TASK-CDB100 |
| TASK-CDB102 | Add proof gates for DB import -> crate export -> materialize round trip | planning | complete | review | pending | TASK-CDB094; TASK-CDB100; TASK-CDB101 |
| TASK-CDB103 | Add bounded Nu/CLI/MCP polyglot views | planning | complete | review | pending | TASK-CDB095 |
| TASK-CDB104 | Add security/no-script-execution/no-credential-leak gates | planning | complete | review | pending | TASK-CDB102; TASK-CDB103 |
| TASK-CDB105 | Release/readiness gate for polyglot import V1.2 planning | planning | complete | review | pending | TASK-CDB091; TASK-CDB092; TASK-CDB093; TASK-CDB094; TASK-CDB095; TASK-CDB096; TASK-CDB097; TASK-CDB098; TASK-CDB099; TASK-CDB100; TASK-CDB101; TASK-CDB102; TASK-CDB103; TASK-CDB104 |
