# NBSOURCE-023: RuVector: Postgres Extension for AI

## Provenance

- Notebook ID: `b09afb74-b464-4bc3-94f0-d5193f7c7d36`
- Object ID: `1da0d3b4-003d-4642-8f66-a8ebd9a17fde`
- Object type: `unknown-type-code-18-source`
- Source SHA-256: `45f8a47516e33875ceee4d42edf91c5076d8111a6299293905cfe09d488b5eed`
- Source bytes / logical lines: `71634` / `1265`
- Packet validation: `pass`
- Evidence boundary: source wording proves no implementation, performance, authority, readiness, or citation claim.

## Atomic claim map

| Claim | Classification | Atomic statement | Canonical task refs |
| --- | --- | --- | --- |
| `RUVPG-CLAIM-001` | `engine-fact` | PostgreSQL is described as an extensible object-relational database that permits custom data types, indexing methods, and functions. | `ADOPT-002`; `POSTGRES-001`; `POSTGRES-005` |
| `RUVPG-CLAIM-002` | `current-implementation-claim` | RuVector is described as a Rust vector and GNN database with a ruvector-postgres extension intended as a drop-in replacement for standard vector extensions. | `ADOPT-002`; `POSTGRES-005`; `POSTGRES-009` |
| `RUVPG-CLAIM-003` | `architecture-proposal` | Installing RuVector inside PostgreSQL is proposed to eliminate a separate vector-database sidecar, external API calls, separate cluster, and duplicate synchronization/security operations. | `PGAUTH-001`; `PGAUTH-006`; `STORE-001`; `POSTGRES-009` |
| `RUVPG-CLAIM-004` | `current-implementation-claim` | RuVector is claimed to expose more than 230 SQL functions covering BM25-vector hybrid search, graph analytics including O(log n) PageRank, and transformer attention. | `ADOPT-002`; `POSTGRES-005`; `POSTGRES-009` |
| `RUVPG-CLAIM-005` | `engine-fact` | The source says an in-process RuVector extension can rely on PostgreSQL point-in-time recovery, RBAC, ACID transactions, and broad client-tool compatibility. | `PGAUTH-001`; `PGAUTH-005`; `POSTGRES-007`; `POSTGRES-009` |
| `RUVPG-CLAIM-006` | `current-implementation-claim` | RuVector is claimed to add 2-4 bit KV-cache quantization, 6-8x memory reduction, hyperbolic embeddings, and self-learning routing/ranking beyond pgvector. | `ADOPT-002`; `POSTGRES-005`; `POSTGRES-009` |
| `RUVPG-CLAIM-007` | `engine-fact` | redb is described as a pure-Rust embedded key-value store without C bindings, running in-process with ACID and MVCC behavior. | `PGAUTH-002`; `ADOPT-001`; `ADOPT-002`; `STORE-001` |
| `RUVPG-CLAIM-008` | `engine-fact` | Vanilla redb is described as key-value storage without SQL, secondary indexes, native vector queries, similarity search, or GNN execution; distributed sharing would require an application protocol. | `PGAUTH-002`; `STORE-001`; `POSTGRES-006` |
| `RUVPG-CLAIM-009` | `architecture-proposal` | Migrating to PostgreSQL plus RuVector is proposed to consolidate relational data, JSON metadata, and vectors and perform filtered similarity search in one network round trip. | `PGAUTH-001`; `PGAUTH-006`; `STORE-001`; `POSTGRES-004`; `POSTGRES-005` |
| `RUVPG-CLAIM-010` | `engine-fact` | redb is not a compiler; rustc compiles it as a Rust crate and Cargo manages the build. | `FOUNDATION-001`; `ADOPT-001`; `PGAUTH-002` |
| `RUVPG-CLAIM-011` | `engine-fact` | Vanilla redb stores bytes and does not create embeddings; an embedding model creates vectors, while vector distance math requires a vector-enabled fork or application SIMD layer. | `PGAUTH-002`; `STORE-001`; `POSTGRES-005`; `POSTGRES-006` |
| `RUVPG-CLAIM-012` | `architecture-proposal` | The proposed workflow embeds source text and query text with a local model, stores vectors, and uses a database-side distance search to return nearest records. | `POSTGRES-004`; `POSTGRES-005`; `POSTGRES-007` |
| `RUVPG-CLAIM-013` | `engine-fact` | The source defines vector similarity as geometric distance and gives the cosine-similarity equation over high-dimensional coordinates. | `POSTGRES-005`; `POSTGRES-009` |
| `RUVPG-CLAIM-014` | `performance-claim` | redb is claimed to obtain zero-copy mmap access and application SIMD using AVX2/AVX-512, processing 16 or 32 vector dimensions per clock and millions of operations per second. | `PGAUTH-002`; `POSTGRES-006`; `POSTGRES-009` |
| `RUVPG-CLAIM-015` | `engine-fact` | redb remains a general-purpose key-value database without any embedding model; an embedding model is needed only for semantic vector workflows. | `PGAUTH-002`; `STORE-001`; `POSTGRES-006` |
| `RUVPG-CLAIM-016` | `authority-claim` | A tiered design is proposed with redb owning hot in-process state and PostgreSQL plus RuVector owning global long-term semantic memory and relational analytics. | `PGAUTH-001`; `PGAUTH-002`; `PGAUTH-006`; `STORE-001` |
| `RUVPG-CLAIM-017` | `architecture-proposal` | Agents are proposed to use redb as a local scratchpad and flush final compressed histories and embeddings asynchronously to PostgreSQL plus RuVector after a task cycle. | `PGAUTH-002`; `PGAUTH-006`; `STORE-001`; `POSTGRES-006` |
| `RUVPG-CLAIM-018` | `performance-claim` | redb scratchpad writes are claimed to take microseconds and impose zero lag on the agent loop. | `PGAUTH-002`; `POSTGRES-006`; `POSTGRES-009` |
| `RUVPG-CLAIM-019` | `architecture-proposal` | Edge nodes are proposed to batch configuration, telemetry, and keys in embedded redb during network instability and stream them to a PostgreSQL plus RuVector core for vectorization and relational indexing. | `PGAUTH-002`; `PGAUTH-005`; `PGAUTH-006`; `STORE-001`; `POSTGRES-006` |
| `RUVPG-CLAIM-020` | `architecture-proposal` | redb is proposed as a BLAKE3-keyed cache of serialized vectors that bypasses embedding inference on cache hits and writes misses to redb and PostgreSQL. | `PGAUTH-002`; `STORE-001`; `POSTGRES-004`; `POSTGRES-005` |
| `RUVPG-CLAIM-021` | `architecture-proposal` | redb is proposed as an application-level WAL that buffers outgoing PostgreSQL operations during latency or outage and later replays them without losing a byte. | `PGAUTH-002`; `PGAUTH-006`; `STORE-001`; `POSTGRES-006`; `POSTGRES-009` |
| `RUVPG-CLAIM-022` | `performance-claim` | The source assigns redb tasks to microseconds and PostgreSQL plus RuVector tasks to milliseconds. | `PGAUTH-002`; `STORE-001`; `POSTGRES-006`; `POSTGRES-009` |
| `RUVPG-CLAIM-023` | `current-implementation-claim` | AgentDB is described as a serverless single-file .rvf cognitive container containing vectors, GNN indexes, learning state, cryptographic audit logs, and active reinforcement-learning ranking. | `PGAUTH-003`; `POSTGRES-006`; `POSTGRES-009` |
| `RUVPG-CLAIM-024` | `engine-fact` | An .rvf file is claimed not to replace foundation-model weights; ruvllm is described as the Rust/Candle inference runtime that keeps one frozen model loaded. | `PGAUTH-003`; `POSTGRES-006`; `FOUNDATION-003` |
| `RUVPG-CLAIM-025` | `performance-claim` | One ruvllm model is claimed to serve many agents by hot-swapping rank-1/rank-2 MicroLoRA adapters from .rvf files in under one millisecond, with SONA steering subsequent generation. | `PGAUTH-003`; `POSTGRES-006`; `POSTGRES-009` |
| `RUVPG-CLAIM-026` | `application-claim` | The source assigns global state to PostgreSQL plus RuVector, one shared frozen model per edge node to ruvllm, per-agent cognition to .rvf, scratch buffering to redb, and claims ruvllm writes updated memory back to each .rvf. | `PGAUTH-001`; `PGAUTH-002`; `PGAUTH-003`; `PGAUTH-006`; `STORE-001`; `POSTGRES-006` |
| `RUVPG-CLAIM-027` | `architecture-proposal` | The source proposes a local ruvllm/.rvf execution layer distinct from a Ruflo/ATAS/RuvLTRA global prediction layer that can use multiple cloud providers. | `LIFEOS-003`; `LIFEOS-005`; `POSTGRES-005`; `POSTGRES-007` |
| `RUVPG-CLAIM-028` | `application-claim` | ATAS/RuvLTRA are claimed to simulate branches with different providers and route tasks by a trained complexity classifier among local models, Haiku, Sonnet, Opus, GPT-4, OpenAI, and Gemini. | `LIFEOS-003`; `LIFEOS-005`; `POSTGRES-005`; `POSTGRES-007`; `LPS-005` |
| `RUVPG-CLAIM-029` | `application-claim` | ATAS is claimed to use Echo-State Networks to model codebase, prompt, and swarm-resource state as bounded Temporal Strange Attractors and detect trajectories leaving those bounds. | `LIFEOS-003`; `LIFEOS-005`; `POSTGRES-005`; `LPS-005` |
| `RUVPG-CLAIM-030` | `performance-claim` | ESNs are claimed to train only a linear readout and predict chaotic agent workflows in milliseconds on edge hardware. | `LIFEOS-005`; `POSTGRES-005`; `POSTGRES-009`; `LPS-005` |
| `RUVPG-CLAIM-031` | `application-claim` | Parallel ESNs are claimed to simulate 10, 50, or 100 future steps containing projected git diffs, token/API/compute burn, complexity spikes, rate limits, and compiler failures, after which RuvLTRA selects the stable branch. | `LIFEOS-003`; `LIFEOS-005`; `POSTGRES-005`; `POSTGRES-009`; `LPS-005` |
| `RUVPG-CLAIM-032` | `architecture-proposal` | ATAS is proposed to run real model work once in isolated .rvf COW branches and merge the selected successful branch rather than ask a stochastic model to repeat it. | `LIFEOS-003`; `POSTGRES-005`; `POSTGRES-010`; `LPS-005` |
| `RUVPG-CLAIM-033` | `performance-claim` | RuVector MinCut is claimed to implement fully dynamic subpolynomial minimum cuts, continuously identify weak links, and isolate/reroute failing agents in milliseconds. | `LIFEOS-003`; `POSTGRES-005`; `POSTGRES-007`; `POSTGRES-009`; `LPS-005` |
| `RUVPG-CLAIM-034` | `application-claim` | AgentDB is claimed to bind every fact, code snippet, and decision to SHAKE256 source-vector provenance and use GNN/Cypher causal edges to reject unsupported claims. | `LIFEOS-003`; `POSTGRES-005`; `LPS-005` |
| `RUVPG-CLAIM-035` | `application-claim` | The source claims RuVector makes it mathematically impossible for an LLM bluff to enter permanent memory or execution state. | `LIFEOS-003`; `POSTGRES-005`; `LPS-005` |
| `RUVPG-CLAIM-036` | `authority-claim` | The source claims the GitHub monorepo is noisy generated build exhaust while Crates.io packages ruvector-core, ruvllm, and ruvector-sona are the clean pure-Rust source of truth and should be used instead of cloning the repository. | `ADOPT-002`; `FOUNDATION-001`; `FOUNDATION-003` |
| `RUVPG-CLAIM-037` | `current-implementation-claim` | napi-rs and wasm-pack are claimed to generate committed Node/WebAssembly bindings and multi-platform binaries, causing noisy branches as part of a prior-art publishing workflow. | `ADOPT-002`; `FOUNDATION-001`; `RELEASE-002` |
| `RUVPG-CLAIM-038` | `current-implementation-claim` | napi-rs is claimed to run the Rust vector/GNN engine in-process through native .node binaries distributed as an OS/architecture matrix without requiring end-user rustc. | `ADOPT-002`; `FOUNDATION-001`; `RELEASE-002` |
| `RUVPG-CLAIM-039` | `performance-claim` | The Node binding is claimed to provide sub-millisecond queries and more than 52,000 inserts per second with zero network overhead. | `ADOPT-002`; `POSTGRES-009` |
| `RUVPG-CLAIM-040` | `performance-claim` | Bun is claimed to load napi-rs libraries out of the box, run bunx ruflo init flawlessly, and outperform Node in FFI/module startup. | `FOUNDATION-001`; `ADOPT-002`; `POSTGRES-009` |
| `RUVPG-CLAIM-041` | `architecture-proposal` | The source endorses the Yazelix/Nix/LifeOS/meta blueprint but proposes static musl compilation or bundled closures to avoid hard-coded /nix/store runtime dependencies. | `FOUNDATION-001`; `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `RUVPG-CLAIM-042` | `architecture-proposal` | A Rust-native Nushell plugin using MessagePack is proposed to stream typed tables into .rvf/redb and avoid JSON/stdout serialization overhead. | `FOUNDATION-001`; `ADOPT-001`; `POSTGRES-004`; `POSTGRES-006` |
| `RUVPG-CLAIM-043` | `architecture-proposal` | LifeOS is proposed to control/render Yazelix/Zellij through UDS or shared redb rather than HTTP, with gitkb/meta isolating Rust build boundaries from JavaScript/WASM outputs. | `FOUNDATION-003`; `LIFEOS-010`; `PGAUTH-002`; `PGAUTH-006`; `POSTGRES-007` |
| `RUVPG-CLAIM-044` | `architecture-proposal` | The proposed final workflow is meta-managed source, Nix static build, portable launch, LifeOS UI, Yazelix Zellij/Nushell initialization, automatic Ruvnet-agent startup, and .rvf/ruvllm execution through native Nushell plugins. | `FOUNDATION-003`; `LIFEOS-003`; `LIFEOS-005`; `POSTGRES-006`; `POSTGRES-009`; `RELEASE-002` |
| `RUVPG-CLAIM-045` | `current-implementation-claim` | The user states FlexNetOS/nu_plugin is intended to support any database, is currently run/tested only with redb, and gives envctl import/export/environment-control capability. | `ADOPT-001`; `ADOPT-002`; `RECOVERY-002`; `STORE-001` |
| `RUVPG-CLAIM-046` | `current-implementation-claim` | The response presents Nushell AST parsing, nu_plugin writes to redb, and envctl vectorization/synchronization into PostgreSQL as an existing flawless ingestion pipeline. | `ADOPT-001`; `ADOPT-002`; `PGAUTH-002`; `PGAUTH-006`; `STORE-001`; `POSTGRES-004` |
| `RUVPG-CLAIM-047` | `architecture-proposal` | The source proposes a PostgreSQL codebase table keyed by UUID with module path, block type, raw code, dependency UUIDs, and a 384-dimensional semantic embedding. | `POSTGRES-002`; `POSTGRES-003`; `POSTGRES-005` |
| `RUVPG-CLAIM-048` | `application-claim` | Agents are claimed to find exact functions with RuVector vector/GNN queries, rewrite raw_code using SQL UPDATE inside COW branches, merge passing branches, roll back failures, and eliminate dirty repositories. | `LIFEOS-003`; `POSTGRES-003`; `POSTGRES-005`; `POSTGRES-010` |
| `RUVPG-CLAIM-049` | `current-implementation-claim` | envctl is presented as a materializer that queries the production database branch, reconstructs directories and source files from code blocks, and emits a clean Nix/Cargo build tree. | `ADOPT-002`; `POSTGRES-008`; `POSTGRES-009`; `POSTGRES-010` |
| `RUVPG-CLAIM-050` | `application-claim` | The source claims hosting code in PostgreSQL solves agent context-window limits and creates a semantic IDE for autonomous generation. | `LIFEOS-003`; `POSTGRES-005`; `POSTGRES-007` |
| `RUVPG-CLAIM-051` | `question-claim` | The user asks whether the proposed Yazelix/Nix/LifeOS/meta/RuVector ecosystem will be reproducible, portable, contained, distributed, complete, and runnable without the Nix store. | `FOUNDATION-003`; `POSTGRES-009`; `RELEASE-002` |
| `RUVPG-CLAIM-052` | `question-claim` | The user asks whether .rvf replaces model weights, whether ruvllm is still required, and whether lightweight per-agent intelligence can be added without full model weights. | `PGAUTH-003`; `POSTGRES-006` |
| `RUVPG-CLAIM-053` | `question-claim` | The user asks how a one-frozen-model edge design relates to a multi-model/provider future-prediction engine. | `LIFEOS-005`; `POSTGRES-005`; `POSTGRES-007` |
| `RUVPG-CLAIM-054` | `question-claim` | The user asks how a stochastic model repeats a selected future, whether MinCut provides the control, and how RuVector prevents bluffing. | `LIFEOS-003`; `POSTGRES-005`; `LPS-005` |
| `RUVPG-CLAIM-055` | `source-provenance-claim` | The final generated verifier prompt repeats many earlier source assertions as requirements, but repetition within this same chat does not provide independent verification. | `NBVERIFY-000`; `POSTGRES-005`; `POSTGRES-009` |

## Classification counts

- `application-claim`: 8
- `architecture-proposal`: 14
- `authority-claim`: 2
- `current-implementation-claim`: 9
- `engine-fact`: 9
- `performance-claim`: 8
- `question-claim`: 4
- `source-provenance-claim`: 1

## Resolution boundary

- All 55 atoms remain queued for primary evidence, benchmark proof, or owner decision.
- Questions remain questions and grant no build, deployment, phase, or execution authority.
- Repetition is relationship evidence only and verifies no claim.
- Raw external fulltext is not duplicated merely for provenance.
