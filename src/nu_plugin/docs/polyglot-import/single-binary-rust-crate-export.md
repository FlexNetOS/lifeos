# Single-Binary Rust Crate Export Contract

## Status and Scope

This document defines the planned output of `codedb-export-crate`. It is a
design contract, not evidence that the generator, crate, or release binary
exists.

The generator converts one verified CodeDB snapshot plus an explicit export
policy into a self-contained Rust crate. Building that crate produces one
binary whose immutable payload can be verified, inspected in bounded form, and
materialized into a new output tree. It does not translate non-Rust programs
into Rust, execute the captured repository, or make generated files
authoritative source.

```text
verified CodeDB snapshot + export policy + generator version
  -> deterministic generated crate
  -> offline Cargo build
  -> one binary containing the export pack
  -> verify
  -> optional, policy-checked materialization into a new directory
```

The export is successful only when the snapshot, policy, generated crate, pack,
and binary are linked by recorded digests. P7 proves that the crate builds, P8
proves that the binary verifies its embedded pack, and P9 separately proves
materialized byte and metadata equality.

## Generated Crate Layout

The generator emits exactly one Cargo package and no workspace members:

```text
codedb-export-<export-id>/
├── Cargo.toml
├── Cargo.lock
├── LICENSES/
│   └── THIRD_PARTY.json
├── README.md
├── build-input.json
├── src/
│   ├── main.rs
│   ├── commands.rs
│   ├── pack.rs
│   ├── policy.rs
│   └── materialize.rs
└── export-pack/
    ├── manifest.cjson
    ├── tables.cdb
    └── blobs/
        └── <sha256-prefix>/<sha256>
```

`Cargo.toml` declares the binary target and only dependencies pinned in
`Cargo.lock`. `build-input.json` binds the source capture run, schema digest,
table-manifest digest, blob-manifest digest, export-policy digest, generator
name/version, and generated-crate ID. `README.md` labels the tree as generated
and records the supported build and verification procedure.

`src/` is generator-owned runtime code. It must not contain source-derived Rust
fragments or invoke a project build script. `export-pack/` is data: `tables.cdb`
contains the bounded, export-approved table representation and `blobs/`
contains only admitted raw blobs. The implementation may replace the directory
with an equivalently specified deterministic archive before stabilization, but
it may not mix runtime code and captured repository bytes or weaken any
manifest rule below.

The generated crate is disposable and reproducible. Editing it never edits the
CodeDB snapshot or captured repository, and regenerating it must target a new,
empty directory.

## Artifact and Authority Boundaries

| Artifact | Authority and mutation rule |
|---|---|
| Captured repository | Authoritative input; never modified by export, build, verification, or materialization |
| CodeDB snapshot | Observational store and export input; opened read-only by the generator |
| Export policy | Explicit input deciding which facts and bytes may leave the snapshot |
| Generated crate | Derived artifact; reproducible from pinned inputs and safe to delete |
| Export pack | Immutable, content-addressed payload; never a source-authority claim |
| Release binary | Delivery wrapper around runtime code and the exact export pack |
| Materialized tree | New projection of admitted entries; never published over an existing path |
| Proof receipt | Evidence binding inputs and outputs; it does not substitute for byte comparison |

Generation must create a `single_binary_export_runs` row and one
`single_binary_embedded_blobs` row per admitted or withheld blob as specified
by the polyglot schema. Materialization evidence belongs in
`single_binary_materialization_proofs`. Withheld content is represented by
manifest metadata and policy outcome, not by a zero-byte placeholder.

## Canonical Manifest and Digest Chain

`manifest.cjson` is UTF-8 canonical JSON with sorted object keys, no
insignificant whitespace, integers for lengths and modes, and arrays sorted by
their declared natural key. Paths use `/` separators and are relative,
lexically normalized byte-preserving path encodings; absolute paths, `.` and
`..` components, drive prefixes, and duplicate normalized paths are invalid.
The format version fixes the canonicalization algorithm. Unknown required
fields or unsupported versions fail verification.

The manifest contains at least:

- format and schema versions;
- generated-crate ID, export-run ID, and source capture-run ID;
- generator identity and configuration digest;
- export-policy digest and inclusion outcome counts;
- schema, table, blob, and license-report digests;
- for each table payload, its logical name, byte length, SHA-256, row count,
  schema version, and canonical row checksum;
- for each repository entry, its relative path, entry kind, blob ID when
  admitted, raw-byte length and SHA-256, executable bit, and symlink link text
  or declared platform limitation;
- for each blob, content SHA-256, byte length, embedded path, embedded SHA-256,
  and inclusion outcome (`embedded`, `hash_only`, or `refused`);
- empty-directory records when directory preservation is enabled; and
- any declared capture gaps or degraded metadata relevant to export.

SHA-256 is the portable content-integrity algorithm for table, blob, file, and
pack artifacts. Existing CodeDB IDs and BLAKE3 identities remain unchanged and
are carried as identifiers rather than recomputed into another domain.

```text
table_manifest_hash = SHA-256(canonical ordered table descriptors)
blob_manifest_hash  = SHA-256(canonical ordered blob descriptors)
manifest_hash       = SHA-256(manifest.cjson)
generated_crate_id  = BLAKE3(
  format_version || source_capture_run_id || schema_digest ||
  table_manifest_hash || blob_manifest_hash || policy_hash ||
  generator_version
)
```

The precise byte framing for `generated_crate_id` must be versioned and
domain-separated before implementation. Concatenating ambiguous text fields is
not conformant.

Generation reads every admitted blob, verifies it against the snapshot's
recorded length and digest, writes it under its content digest, and then
re-reads the completed pack to compute manifest evidence. Any missing,
additional, stale, or mismatched entry aborts generation before publication.
Duplicate byte content may share one embedded blob, but every original path
remains a distinct manifest entry.

Two generations from byte-identical inputs, the same policy, generator
version, and target triple must produce byte-identical crate files and pack
bytes. Timestamps, host paths, random IDs, locale, filesystem enumeration
order, and observation time are excluded from generated content. Binary
reproducibility is a separate toolchain-qualified claim and requires a pinned
Rust toolchain, target, linker, build flags, and direct evidence; crate
determinism alone does not establish it.

## Embedded-Pack and Runtime Contract

The release binary embeds the exact bytes covered by `manifest_hash`; it must
not search beside itself for replacement payloads. On every operation it first
performs structural checks, then verifies the manifest and all payload lengths
and SHA-256 digests before returning data or writing output. Verification is
streaming and bounded so a declared length cannot force an unbounded
allocation.

The runtime is read-only except for an explicitly selected materialization
destination and an optional explicitly selected receipt path. Its stable
capability families are:

- `verify`: validate format, manifest, tables, blobs, policy binding, and
  internal references;
- `list`, `schema`, and `summary`: return bounded metadata without raw source;
- `license-report`: display the embedded generated report; and
- `materialize`: recreate policy-admitted entries under the safeguards below.

The release binary is named `codedb-export`. It exposes only the command matrix
below. All commands verify the complete embedded pack before performing their
command-specific work. They never use the network, load plugins, execute
captured programs, install packages, or evaluate user-supplied queries.

## Release-Binary Command Matrix

```text
codedb-export [--format text|json] <command> [command options]
```

`--format` defaults to `text`. Machine-readable output is selected only with
`--format json`; it is one UTF-8 JSON object followed by a newline, with
`schema_version`, `command`, `pack_id`, `manifest_sha256`, and `result` fields.
JSON object keys and array ordering are stable within a schema version.
Informational output goes to standard output. Diagnostics go to standard error
and must not include captured bytes, absolute capture paths, environment
values, or credential-like names. No command accepts input from standard input.

| Command | Accepted options | Successful result | Bound and prohibited behavior |
|---|---|---|---|
| `verify` | none | Pack identity, format/schema versions, policy digest, verified table/blob counts, verified byte count, and `valid: true` | Reads and hashes the complete embedded payload. It emits no table rows, paths, or blob bytes. |
| `summary` | none | Fixed aggregate counts and byte totals by entry kind and inclusion outcome, plus capture-gap and degraded-metadata counts | One fixed-size record; no names, source fragments, or per-entry output. |
| `schema` | `--table <logical-name>`; optional `--offset <u64>` and `--limit <u16>` | Bounded ordered column descriptors for the named exported table | Default limit 100; hard maximum 500. Offset plus limit overflow is invalid. Only exact logical names present in the manifest are accepted; no patterns or schema query language. |
| `list` | optional `--kind file\|directory\|symlink`, `--outcome embedded\|hash_only\|refused`, `--offset <u64>`, and `--limit <u16>` | Bounded manifest-entry metadata ordered by canonical path key, plus `next_offset` when more entries exist | Default limit 100; hard maximum 500. It never emits raw bytes or secret-bearing refused paths. Filters are exact enum matches; no glob, regex, expression, or recursive expansion is accepted. |
| `license-report` | optional `--offset <u64>` and `--limit <u16>` | Bounded ordered license-report records containing only fields admitted to the generated report | Default limit 100; hard maximum 500. It does not rescan files, contact registries, or print license text blobs; a record may contain the embedded license identifier and bounded attribution fields only. |
| `materialize` | exactly one `--destination <path>`; optional `--receipt <new-file>` | A newly published tree and a fixed-size result containing destination-manifest digest, entry/byte totals, comparison result, and receipt digest when requested | Destination must satisfy the materialization contract. Neither destination nor receipt may exist. There is no overwrite, merge, subset, path filter, dry-run that skips verification, or output-to-standard-output mode. |

`--offset` defaults to zero. Decimal values must be canonical unsigned integers
with no sign; values outside the declared type or beyond the available record
count are rejected. Pagination operates over the immutable canonical ordering,
so repeated calls against the same binary cannot skip or duplicate records.
Every returned page includes `offset`, `limit`, `returned`, `total`, and either
`next_offset` or `null`. Text mode presents the same fields and records as JSON
mode and is subject to the same limits.

The CLI accepts no global options other than `--format`, `--help`, and
`--version`. `--help` and `--version` inspect no payload and return fixed
generator-owned text; every other invocation performs full verification first.
Unknown options, repeated singleton options, trailing operands, unsupported
format values, invalid UTF-8 arguments, and ambiguous command spelling fail
closed. Paths are passed as operating-system path values and are never
interpreted as shell syntax.

Exit status is part of the interface:

| Status | Meaning |
|---:|---|
| `0` | Command completed and all required verification or comparison checks passed |
| `2` | CLI usage, option, pagination, or unsupported-version error |
| `3` | Embedded manifest, table, blob, policy binding, or reference verification failed |
| `4` | Requested logical table or exact filter subject was not exported |
| `5` | Materialization destination, path, metadata, publication, rollback, or receipt failure |
| `70` | Internal invariant failure that cannot be classified above |

On non-zero exit, standard output is empty. In JSON mode, standard error is one
bounded JSON error object with `schema_version`, `command`, `error_code`, and a
sanitized `message`; text mode emits the corresponding single diagnostic.
Errors never include a backtrace unless a separately built development binary
is used, and that binary is not a conforming release artifact.

This interface does not authorize an unbounded dump, arbitrary query
execution, captured program execution, package installation, network access,
or a raw-source MCP escape hatch. Adding a command, increasing a hard limit, or
exposing another field is a versioned contract change requiring security and
proof-gate review.

## Materialization Contract

Materialization is opt-in and accepts only a new, empty destination whose
resolved parent is selected by the caller. The runtime must:

1. verify the entire pack before the first publication write;
2. validate all paths and symlink link text without following captured
   symlinks;
3. stage within the destination's parent filesystem using no-follow,
   no-replace operations;
4. write regular files from verified bytes, then apply only policy-approved
   executable metadata;
5. create directories and safe symlinks in deterministic order;
6. compute an independent observed destination manifest;
7. compare it with the admitted export manifest; and
8. atomically publish the completed tree or remove the staging tree on failure.

An existing destination, escaping or absolute link, unsupported required
metadata, digest mismatch, refused entry, path collision, or write outside the
selected root fails closed. The runtime never overwrites, merges into, or
repairs an existing source tree. Platform inability to recreate a symlink or
executable bit is a declared degraded result only when policy permits it; it
must never silently copy link-target bytes or claim P9 equality.

The receipt binds the source capture, policy, schema, export pack, release
binary, destination manifest, comparison policy, and result digests. A receipt
is emitted only after rollback or successful publication is known.

## Redaction and Credential Policy

Export policy is deny-by-default for secret-bearing or credential-like paths
and values. Policy evaluation happens before bytes enter the generated crate,
build directory, compiler inputs, logs, license report, or release binary.
Classification produces exactly one outcome:

- `embedded`: bytes are admitted and their length and digest are manifested;
- `hash_only`: path-safe metadata, length, and digest may be recorded, but
  bytes are absent and materialization is unavailable; or
- `refused`: neither bytes nor secret-bearing names/values are exported; the
  manifest retains only a non-sensitive policy reason and stable subject ID
  needed to prove refusal.

A redaction rule must be identified by the export-policy digest. The generator
must not copy `.env` files, private keys, credential stores, auth tokens, or
other denied content merely because Tier 0 captured them. Secret scanning is a
defense-in-depth detector, not proof that admitted bytes are safe; explicit
allow rules cannot override repository-scope hard denies without a separately
approved future unsafe gate.

Errors, bounded views, and receipts use stable IDs and digests rather than raw
values. They must not print rejected bytes, environment variables, absolute
source paths, command-line secrets, or surrounding source snippets. A
credential-policy error aborts publication and leaves no partial crate or
binary advertised as complete.

## Offline-Build Feasibility

The generated crate is offline-buildable only when all of these inputs are
already present and pinned:

- the exact Rust toolchain and compilation target;
- `Cargo.lock`;
- every crate source required by the lockfile, provided by a pre-populated
  Cargo cache or a checksum-verified vendored dependency directory;
- any target linker and system libraries declared by the build environment;
  and
- the already generated export pack.

The default design favors a small pure-Rust runtime and forbids generated-crate
build scripts, procedural macros, Git dependencies, network fetches, package
manager execution, and project scripts. If a necessary dependency violates
that baseline, offline feasibility is a blocker until it is removed or
explicitly specified and pinned; the generator must not silently download it.

The minimum P7 procedure is equivalent to:

```text
cargo build --release --locked --offline --target <pinned-target>
```

run in a sandbox with networking disabled and only the generated crate,
declared dependency cache/vendor tree, toolchain, target, and output directory
mounted. Success proves build feasibility for that recorded environment, not
for arbitrary platforms. The crate's license report and dependency checksums
must cover all linked third-party code.

## Failure and Publication Rules

Generation uses a sibling staging directory and publishes by atomic rename
only after all crate and pack checks pass. The final crate path must not exist.
Failure removes the staging artifact where safe and records a validation error;
it never mutates the snapshot or source repository.

The binary exits non-zero without partial output on:

- unsupported format or schema version;
- any manifest, table, blob, policy, or embedded-pack mismatch;
- missing or undeclared content;
- denied data encountered in an embedded payload;
- unsafe path, symlink, destination, or metadata;
- an attempt to overwrite or merge; or
- inability to produce required proof evidence.

## Acceptance Evidence

CDB100 is design-complete when review confirms that this document fixes the
crate tree, authority boundaries, canonical manifest and checksum chain,
embedded runtime responsibilities, offline build prerequisites, and
redaction/materialization failure policy.

CDB101 is design-complete when review confirms that the release-binary matrix
fixes exact command spelling and options, stable text/JSON behavior, finite
pagination defaults and hard caps, sanitized failure output and exit statuses,
and fail-closed materialization behavior without introducing an execution,
network, query, or raw-byte escape hatch.

Future implementation is not complete until:

- deterministic-generation fixtures compare two generated crate trees;
- P7 records a locked, network-disabled offline build;
- P8 detects mutations independently in the manifest, tables, and blobs;
- P9 covers raw bytes, executable bits, symlinks, empty directories when
  declared, refused credentials, occupied destinations, escaping paths, and
  rollback; and
- proof rows and receipts bind the exact snapshot, policy, generator, pack,
  binary, and materialized output involved.
