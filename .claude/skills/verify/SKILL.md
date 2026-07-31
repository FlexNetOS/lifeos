---
name: verify
description: Bring up PostgreSQL/RuVector and drive the lifeos verify:* scripts to verify a change at runtime. Use for lifeos changes instead of running the test suite.
---

# Verifying lifeos

Most of what matters here is verified by the repo's own `verify:*` scripts,
which run against the live PostgreSQL/RuVector instance. They are real
executions that write evidence receipts, not tests. Run those.

## PostgreSQL must be up first, and it is not automatic

Nearly every `verify:*-live` script goes through `psql` on a unix socket. If
the cluster is down you get `connection to server on socket
".../.s.PGSQL.5432" failed: No such file or directory`, which is an
environment failure, not a finding about the change.

```bash
D=/home/flexnetos/meta/var/lib/postgresql/17      # the datadir IS 17/, not 17/data
S=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql
mkdir -p $S
rtk proxy -- pg_ctl -D $D -l $D/logfile -o "-k $S" start
rtk proxy -- pg_isready -h $S
export PGHOST=$S                                  # scripts expect this socket dir
```

The socket directory is **not** in `postgresql.conf`; it has to be passed with
`-o "-k $S"` or the scripts cannot find it. Binaries come from
`/home/flexnetos/.nix-profile/bin` — `pg_config` is not among them, so do not
rely on `pg_config --pkglibdir` to locate the extension.

Sanity-check the extension before blaming a script:

```bash
rtk proxy -- psql -h $S -U flexnetos -d lifeos -At \
  -c "select extensions.ruvector_version()"        # expect 2.0.1
```

Note the version surfaces disagree by design: `pg_extension.extversion` reads
`0.3.1` while `ruvector_version()` returns `2.0.1` (SQL schema version vs
library version). The `.so` lives at
`/home/flexnetos/meta/var/lib/ruvector/ext/ruvector.so`, not in a pg tree.

## Drive the scripts

```bash
rtk proxy -- bun scripts/verify-node-authority.mjs        # every @ruvector package
rtk proxy -- bun scripts/verify-rvf-solver-artifact.mjs   # solver wasm + acceptance
rtk proxy -- bun scripts/verify-postgres-ruvector-live.mjs
rtk proxy -- bun scripts/verify-cow-branch-live.mjs
rtk proxy -- bun scripts/verify-cow-frontdoor-live.mjs
rtk proxy -- bun scripts/verify-cow-native-roundtrip-live.mjs
rtk proxy -- bun scripts/verify-dense-retrieval-live.mjs
```

Read the exit code, not just the text. Several scripts print a JSON receipt to
stderr and still exit non-zero, and at least one prints an alarming line on the
happy path:

- `verify-cow-native-roundtrip-live` prints `INV-011 native RVF roundtrip
  failed: SQL child generation 4294967296 exceeds u32::MAX` and then reports
  `"status": "passed"`. That is correct — the script deliberately feeds
  `generation_id: 4_294_967_296` to prove the boundary is rejected, and throws
  if it is *accepted*. Do not report it as a failure.
- `verify-postgres-ruvector-live` fails on any witness-chain inconsistency.
  Its receipt breaks the reason out into `broken_links` vs `head_mismatches`,
  so read those two numbers rather than the summary string.

## Witness-chain integrity

`scripts/verify-postgres-ruvector.mjs` requires every chain's
`head_sequence`/`head_shake256` to equal its last entry. To find an offender:

```sql
SELECT c.domain, c.head_sequence, COALESCE(m.max_seq,0) AS actual_max
  FROM lifeos_agent.witness_chain c
  LEFT JOIN (SELECT chain_id, max(sequence) max_seq
               FROM lifeos_agent.witness_entry GROUP BY chain_id) m
    ON m.chain_id = c.chain_id
 WHERE c.head_sequence <> COALESCE(m.max_seq,0);
```

`lifeos_agent.append_witness` advances the head in the same transaction as the
insert, so a stale head means a writer that bypassed it. Repairing one means
advancing the head to the actual last entry — never deleting the entry, which
is a signed record. Note that the link check exempts `sequence = 1`
(`WHERE sequence > 1`), so a lone first entry is not link-verified; check that
its `previous_shake256` equals the chain's `head_shake256` before trusting it.

## Node packages

`@ruvector` versions are constrained by ranges in `ruvector` and `agentdb`, so
do not compare installed versions against registry-latest and call the
difference a gap — `@ruvector/attention` is capped at `^0.1.3` on purpose. The
family also self-wires: bumping `@ruvector/rvf` moves `rvf-node` and its native
without either being named. See `vendor/rvf-solver/PROVENANCE.md` before
touching that override; it is load-bearing.
