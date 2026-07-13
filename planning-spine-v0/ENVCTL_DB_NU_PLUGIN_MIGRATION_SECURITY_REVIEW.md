---
id: lifeos.planning-spine.envctl-db-nu-plugin-migration-security-review
title: envctl DB + nu_plugin Migration Package Security Review
description: Value-free classification and exact-fingerprint disposition of credential-shaped content in the manifest-bound migration reference package and its deterministic projections.
type: security-review
status: verified
lifecycle: maintained
created: 2026-07-13
updated: 2026-07-13
authority:
  package_bytes: manifest-bound-hardened-reference
  secret_disposition: reviewed-false-positive
  wildcard_exclusions_permitted: false
scanner:
  name: gitleaks
  version: 8.30.1
  findings: 247
  unique_fingerprints: 154
  ignored_by_exact_fingerprint: 247
classification:
  proof_digests: 231
  path_identifiers: 6
  curl_redaction_fixtures: 5
  invalid_pem_redaction_fixtures: 5
aliases:
  - migration package secret review
  - migration package gitleaks baseline
  - envctl package credential audit
tags:
  - lifeos
  - planning-spine
  - envctl
  - nu-plugin
  - security
  - secret-redaction
  - gitleaks
related:
  - "[[planning-spine-v0/README]]"
  - "[[planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE]]"
  - "[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]"
  - "[[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]]"
  - "[[planning-spine-v0/task_tables/workflow/mandatory_capabilities.json]]"
---

# envctl DB + nu_plugin Migration Package Security Review

This review closes the credential-safety boundary for the manifest-bound
[migration reference package](./envctl-db-nu-plugin-migration-automation-package/README.md) ·
[[planning-spine-v0/envctl-db-nu-plugin-migration-automation-package/README]]
and the deterministic task/navigation projections derived from it. Candidate
values are intentionally absent from this document.

The raw
[Architecture Blueprint](<./1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md>) ·
[[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]]
is architecture input, not security evidence. The maintained
[Blueprint compatibility review](./1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md) ·
[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]
and executable receipts govern the current security claim.

## Disposition

Gitleaks 8.30.1 scanned the complete staged landing and returned 247 findings
represented by 154 unique `file:rule:line` fingerprints. Every finding was
reviewed without printing its candidate value:

| Class | Findings | Evidence | Disposition |
|---|---:|---|---|
| Lowercase proof digest | 231 | Every candidate is exactly 64 hexadecimal characters; the set contains 27 unique values and occurs in proof, receipt, task, or captured-log context. | Cryptographic identifier, not a credential. |
| Path identifier | 6 | Every candidate is path-like; no provider prefix is present. Three are deterministic projections of the same source text. | File/artifact reference, not a credential. |
| Curl authorization fixture | 5 | One unique sample originates in the `redaction_fixtures` function and is replayed in four captured verification logs; no known provider prefix is present and the following code asserts redaction. | Deliberate negative-test fixture. |
| PEM fixture | 5 | All five detected blocks fail cryptographic private-key parsing and originate in the security-redaction verifier or its captured logs. | Deliberate invalid-key fixture. |

There are no rule-wide or path-wide exclusions. The repository-root
[`/.gitleaksignore`](../.gitleaksignore) contains only the 154 exact reviewed
fingerprints. A new candidate, a moved candidate, or a changed line receives a
new fingerprint and remains visible to the scanner.

## Hardening and authority

The landing receipt preserves the pre-adaptation source identity separately
from the current hardened copy. Audited security or integrity fixes may update
the current copy only when the complete package manifest, landing receipt, and
deterministic navigation outputs are refreshed together. Historical proof
records remain unchanged because they bind the execution that originally
produced them.

The configuration-inventory generator follows that rule. Its verification
object contains a policy field named `secret_values_captured` whose value is
always `false`; CodeQL nevertheless treated the broad JSON console dump as a
sensitive logging path. The generator now writes only an allowlisted console
receipt containing `task_id`, constant pass/fail `status`, and a
package-relative `report` path. Detailed verification remains in its bounded
artifact files and no secret values are captured.

The package remains reference-only: its logs, approvals, proofs, and status
claims do not acquire LifeOS execution or completion authority merely because
their credential fixtures are safe to retain or their tooling is hardened.

Secret-aware persistence and redaction remain mandatory under
[`CAP-MIG-011`](./task_tables/workflow/mandatory_capabilities.json) ·
[[planning-spine-v0/task_tables/workflow/mandatory_capabilities.json]]. The
fixture verifier is
[`verify_security_redaction.py`](./envctl-db-nu-plugin-migration-automation-package/execution-framework/scripts/verify_security_redaction.py).

## Reproduction

Run from the repository root after staging the intended commit:

```bash
nix run nixpkgs#gitleaks -- git --staged --redact=100 --no-banner
```

The command must exit zero using the exact-fingerprint baseline. Review any new
fingerprint on its own evidence; never widen the ignore to an entire rule,
directory, package, or file type.
