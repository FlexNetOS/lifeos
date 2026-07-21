# RuVector complete feature matrix

Exhaustive verification of the ruvector PostgreSQL extension surface installed
on the canonical LifeOS cluster, cross-checked against the blueprint anchor's
§3 "Complete PostgreSQL extension and SQL-function surface".

## What it proves

- **Every installed extension object is exercised** with at least one positive
  assertion: 190 functions, 1 aggregate, 5 operators, 2 types (`ruvector`,
  `_ruvector`), 2 access methods (`hnsw`, `ruivfflat`), 6 operator classes —
  206 objects. A hard coverage gate fails the run if any live object lacks a
  matrix case, so the coverage claim is enforced, not asserted.
- **Every anchor-§3-cataloged name is accounted**: 350 catalog names = 182
  installed functions + 8 resolved to other object classes (access methods,
  opclasses, `*_fn` aliases, type, aggregate) + 160 absent from the official
  release artifact. The anchor itself records the split: the pinned source
  tree carries 346 `#[pg_extern]` definitions, while the checked release
  artifact `ruvector--0.3.0.sql` emits 190 — a feature-gated subset. Both
  official planes (the nix-packaged extension and docker
  `ruvnet/ruvector-postgres:2.0.5`) expose identical 191-function surfaces,
  verified live.
- Total matrix rows: **372** (all tested green or explicitly accounted).

## Defect register (proven, signature-asserted)

| ID | Finding |
|---|---|
| RUVMX-DEFECT-001 | `vector_avg_final` release-artifact body calls `vector_mul_scalar(real[], double precision)`, which does not exist — every invocation fails with `undefined_function`. |
| RUVMX-DEFECT-002 | `ruvector_record_feedback` is structurally unsatisfiable: the learning tracker's only writer (`ruvector_record_trajectory`) is feature-gated out of the artifact, so no trajectory can ever match. |
| RUVMX-DEFECT-003 | `ruvector_auto_tune` SQL declares `sample_queries real[]` while the library reads JSONB — every non-NULL call fails with `unknown type of jsonb container`; the NULL path works. |
| RUVMX-NOTE-001 | Installed `<#>` returns **positive** inner product; anchor §3.1 documents negative inner product. |

Defective paths are asserted against their exact failure signatures, so a
future artifact that fixes them will turn those cases red and force the matrix
to be updated — regressions and fixes are both detected.

## Behavioral findings

- Graph and RDF planes persist in `_ruvector_*` tables (cross-session); agent
  registry, tenant registry, and learning state are session-local backend
  memory — lifecycle families run inside single-session `DO` blocks.
- Solvers take COO triplet JSON `[[row, col, value], ...]`; CG solves
  `[[4,1],[1,3]] x = [1,2]` to the analytically correct solution in-matrix.
- `ruivfflat` with the default probe budget can return fewer than `LIMIT k`
  rows (IVF recall semantics).
- `register_agent_full` requires the full serde config: `name`, `agent_type`
  (`LLM|Embedding|Specialized|Vision|Audio|Multimodal|Custom`),
  `capabilities`, `cost_model{per_request}`, `performance{avg_latency_ms,
  p95_latency_ms, p99_latency_ms, quality_score, success_rate,
  total_requests}`, `is_active`, `metadata`.

## Run

```bash
python3 run_matrix.py
```

Environment overrides: `RUVECTOR_PGBIN`, `RUVECTOR_PGHOST` (socket dir),
`RUVECTOR_PGPORT`, `RUVECTOR_DB` (default `ruvector_matrix` — a dedicated
matrix database so the canonical `lifeos` database stays clean; the §16.2
bootstrap contract is re-applied there on every run), `RUVECTOR_ANCHOR`.

Exit 0 requires: zero failed cases AND zero uncovered live objects.

## Results

- `results/receipts.jsonl` — one record per case (assertion, outcome, timing).
- `results/summary.json` — counts, coverage, annotations, defect register.
- `results/absent_account.json` — per-name accounting for all 168 non-installed
  anchor identifiers with classification and absence reason.
- `results/environment.json` — cluster version, extension versions, SIMD
  capability, and sha256 of the exact `ruvector.so` and `ruvector--0.3.0.sql`
  artifacts the run executed against.
