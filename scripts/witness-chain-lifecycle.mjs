// ARCHBP-016 — witness-chain anti-bluffing receipts.
//
// Binds source, vector, decision, execution, and proof events into a
// tamper-evident hash chain using a REVIEWED STANDARD primitive (SHA-256 from
// node:crypto — no custom cryptography). Each entry hashes the previous entry's
// hash, a per-event-kind domain tag, the bound algorithm id, the schema
// version, and a digest of the event data. Independent recomputation
// (verifyChain) detects event removal, reorder, substitution, replay,
// algorithm confusion, and partial writes, and fails closed. The claim is
// limited to TAMPER EVIDENCE and fail-closed policy — no mathematical-
// impossibility claim is made. Runs under Bun/Node.

import { createHash } from "node:crypto";

export const WITNESS_ALGORITHM = "sha256";
export const WITNESS_SCHEMA_VERSION = "witness-chain.v1";

/** Distinct domain tag per event kind — a source event can never verify as a proof event. */
export const DOMAIN_TAGS = Object.freeze({
  source: "wc:v1:source",
  vector: "wc:v1:vector",
  decision: "wc:v1:decision",
  execution: "wc:v1:execution",
  proof: "wc:v1:proof",
});

/**
 * The explicit algorithm decision — SHA-256 is chosen over the blueprint's
 * SHAKE-256 by reasoning, not by copying the blueprint by assertion.
 */
export const ALGORITHM_DECISION = Object.freeze({
  chosen: "sha256",
  considered: ["sha256", "shake256"],
  customCryptography: false,
  rationale:
    "SHA-256 (FIPS 180-4) is the reviewed digest already used by the planning-spine proof ledger, so witness chains stay independently verifiable with the same proven primitive. SHAKE-256 (used by the RVF solver) was considered but not adopted here to avoid two competing digest schemes; the algorithm id is bound into every entry so an algorithm-confusion swap is detected.",
  domainSeparation: "per-event-kind domain tag + schema version bound into every entry hash",
  claim: "tamper-evident and fail-closed: detects removal, reorder, substitution, replay, algorithm confusion, and partial writes. No mathematical-impossibility or unforgeability-proof claim is made.",
});

const REVIEWED_ALGORITHMS = new Set(["sha256"]);

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function digest(algorithm, preimage) {
  return createHash(algorithm).update(preimage).digest("hex");
}

function dataDigestOf(algorithm, domainTag, data) {
  return digest(algorithm, `${domainTag}|data|${stableStringify(data)}`);
}

function entryHashOf(algorithm, entry) {
  const preimage = [
    entry.schemaVersion,
    entry.algorithm,
    entry.seq,
    entry.eventType,
    entry.domainTag,
    entry.dataDigest,
    entry.prevHash,
  ].join("|");
  return digest(algorithm, preimage);
}

export class WitnessChain {
  constructor(algorithm = WITNESS_ALGORITHM) {
    if (!REVIEWED_ALGORITHMS.has(algorithm)) {
      throw new Error(`ARCHBP-016: unreviewed witness algorithm '${algorithm}'`);
    }
    this.algorithm = algorithm;
    this.entries = [];
  }

  record(eventType, data) {
    const domainTag = DOMAIN_TAGS[eventType];
    if (!domainTag) throw new Error(`ARCHBP-016: unknown witness event type '${eventType}'`);
    const seq = this.entries.length + 1;
    const prevHash = this.entries.length ? this.entries[this.entries.length - 1].entryHash : "GENESIS";
    const dataDigest = dataDigestOf(this.algorithm, domainTag, data);
    const entry = {
      seq,
      eventType,
      domainTag,
      data,
      dataDigest,
      prevHash,
      algorithm: this.algorithm,
      schemaVersion: WITNESS_SCHEMA_VERSION,
    };
    entry.entryHash = entryHashOf(this.algorithm, entry);
    this.entries.push(entry);
    return entry;
  }
}

/**
 * Independent verification — recomputes the entire chain from the entries alone
 * and fails closed on the first inconsistency.
 */
export function verifyChain(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { valid: false, brokenAt: -1, reason: "empty-chain" };
  }
  const chainAlgorithm = entries[0]?.algorithm;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (!e || typeof e !== "object") {
      return { valid: false, brokenAt: i, reason: "malformed-entry" };
    }
    if (typeof e.entryHash !== "string" || e.entryHash.length === 0) {
      return { valid: false, brokenAt: i, reason: "partial-write" };
    }
    if (!REVIEWED_ALGORITHMS.has(e.algorithm) || e.algorithm !== chainAlgorithm) {
      return { valid: false, brokenAt: i, reason: "algorithm-confusion" };
    }
    if (e.seq !== i + 1) {
      return { valid: false, brokenAt: i, reason: "removal-reorder-or-replay" };
    }
    if (!DOMAIN_TAGS[e.eventType] || DOMAIN_TAGS[e.eventType] !== e.domainTag) {
      return { valid: false, brokenAt: i, reason: "domain-tag-mismatch" };
    }
    const expectedPrev = i === 0 ? "GENESIS" : entries[i - 1].entryHash;
    if (e.prevHash !== expectedPrev) {
      return { valid: false, brokenAt: i, reason: "broken-link" };
    }
    let recomputedData;
    let recomputedEntry;
    try {
      recomputedData = dataDigestOf(e.algorithm, e.domainTag, e.data);
      recomputedEntry = entryHashOf(e.algorithm, e);
    } catch {
      return { valid: false, brokenAt: i, reason: "algorithm-unsupported" };
    }
    if (recomputedData !== e.dataDigest) {
      return { valid: false, brokenAt: i, reason: "data-substitution" };
    }
    if (recomputedEntry !== e.entryHash) {
      return { valid: false, brokenAt: i, reason: "entry-hash-mismatch" };
    }
  }
  return { valid: true, brokenAt: -1, reason: "verified" };
}

// ---------------------------------------------------------------------------
// CLI proof emitter (Bun) — build a chain and prove tamper detection.
// ---------------------------------------------------------------------------
async function emitProof() {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");

  const build = () => {
    const wc = new WitnessChain(WITNESS_ALGORITHM);
    wc.record("source", { id: "S1", bytes: 10 });
    wc.record("vector", { id: "V1", dim: 8 });
    wc.record("decision", { id: "D1", route: "local" });
    wc.record("execution", { id: "E1", status: "ran" });
    wc.record("proof", { id: "P1", accepted: false });
    return wc.entries;
  };

  const wellFormedValid = verifyChain(build()).valid;

  const removal = (() => { const e = build(); e.splice(2, 1); return !verifyChain(e).valid; })();
  const reorder = (() => { const e = build(); [e[1], e[2]] = [e[2], e[1]]; return !verifyChain(e).valid; })();
  const substitution = (() => {
    const e = build().map((x) => ({ ...x }));
    e[3] = { ...e[3], data: { id: "E1", status: "TAMPERED" } };
    return !verifyChain(e).valid;
  })();
  const replay = (() => { const e = build(); e.push({ ...e[1] }); return !verifyChain(e).valid; })();
  const algorithmConfusion = (() => {
    const e = build().map((x) => ({ ...x, algorithm: "shake256" }));
    return !verifyChain(e).valid;
  })();
  const partialWrite = (() => {
    const e = build().map((x) => ({ ...x }));
    delete e[2].entryHash;
    return !verifyChain(e).valid;
  })();

  // Independent verification: a fresh verifier with no shared state recomputes
  // the same verdict for the untampered chain.
  const independentVerification = verifyChain(build()).valid === true;

  const result = {
    task: "ARCHBP-016",
    generatedAt: new Date().toISOString(),
    algorithm: WITNESS_ALGORITHM,
    schemaVersion: WITNESS_SCHEMA_VERSION,
    decision: ALGORITHM_DECISION,
    wellFormedValid,
    tamperDetection: { removal, reorder, substitution, replay, algorithmConfusion, partialWrite },
    independentVerification,
    claim: ALGORITHM_DECISION.claim,
  };

  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  const canonical = resolve(process.cwd(), "node_modules/.cache/lifeos/archbp-016/witness-proof.raw.json");
  const outputPath = outputArg ? resolve(process.cwd(), outputArg.slice("--output=".length)) : canonical;
  mkdirSync(dirname(outputPath), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outputPath, json);
  process.stdout.write(json);
}

if (import.meta.main) {
  emitProof().catch((error) => {
    console.error("ARCHBP-016 witness-chain proof failed:", error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
