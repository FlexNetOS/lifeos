# 06 Proof Ledger

## Purpose

The proof ledger is the completion authority for the planning spine. It stores evidence that a task, action, artifact, or decision actually happened and passed its required gate.

## Proof Before Completion

Every execution path must produce proof before completion.

v0 completion rule:

```text
task.status = complete
only if
  verification_gate.result = pass
  AND proof_record.count >= 1
  AND verifier_agent accepted the proof
```

## ProofRecord Minimum

Each `ProofRecord` captures:

- what was proven,
- how it was proven,
- where the evidence lives,
- a content hash,
- who verified it,
- when verification happened,
- whether the result passed or failed.

## Ledger Subjects

| Subject | Example |
|---|---|
| `task` | task graph node completion |
| `artifact` | generated task artifact |
| `decision` | next-action recommendation acceptance |
| `action` | cell execution step |

## Failure Handling

If proof is missing, invalid, or fails verification:

1. the subject stays non-complete,
2. the task graph receives a blocking constraint,
3. the decision engine must recommend either remediation or rollback,
4. the ledger records the failed proof attempt.
