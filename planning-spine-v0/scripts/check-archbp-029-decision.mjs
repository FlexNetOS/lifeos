// ARCHBP-029 gate check: the Rust-toolchain bundling decision must be recorded,
// bounded, and cross-referenced so no release task assumes an undecided model.
// Mirrors the task row's verification_gate clauses. Exit 0 = gate satisfied.
import fs from "node:fs";
import path from "node:path";

const pkgRoot = path.join(process.cwd(), "planning-spine-v0");
const recordPath = path.join(pkgRoot, "1.0_VISION", "current_state", "ARCHBP-029-toolchain-decision.md");
const openQuestionsPath = path.join(pkgRoot, "09_OPEN_QUESTIONS.md");
const portabilityModelPath = path.join(pkgRoot, "1.0_VISION", "FOUNDATION_META_PORTABILITY_MODEL.md");

const failures = [];

function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failures.push(name);
}

check("decision record exists", fs.existsSync(recordPath));
const record = fs.existsSync(recordPath) ? fs.readFileSync(recordPath, "utf8") : "";

// One option (or explicitly bounded hybrid) is recorded.
check("record selects exactly one option", /\*\*Decision:\*\*/.test(record)
  && (/build-only provenance/i.test(record) || /relocatable Rust closure/i.test(record)));
// Exact unblock conditions.
check("record states unblock condition", /\*\*Unblock condition:\*\*/.test(record));
// Rollback.
check("record states deferral/rollback rule", /\*\*Deferral\/rollback rule:\*\*/.test(record));
// Provenance and update ownership.
check("record assigns provenance and update ownership", /provenance.*ownership|update ownership/i.test(record));
// Offline and relocation expectations.
check("record states offline expectations", /offline/i.test(record));
check("record states relocation expectations", /relocat/i.test(record));
// Effects on musl and closure tasks.
check("record binds effects on ARCHBP-021 musl/closure task", /ARCHBP-021/.test(record));
// Measured evidence, not prose: the real closure size must appear.
check("record carries measured closure size (772.8 MiB)", /772\.8 MiB/.test(record));
check("record carries measured store-path count (11)", /\b11 store paths\b/.test(record));

// Decision ledger entry exists.
const openQuestions = fs.readFileSync(openQuestionsPath, "utf8");
check("09_OPEN_QUESTIONS.md records DECIDE-007 toolchain decision",
  /DECIDE-007/.test(openQuestions) && /toolchain/i.test(openQuestions));

// The portability model no longer marks the question undecided.
const portabilityModel = fs.readFileSync(portabilityModelPath, "utf8");
check("portability model marks the toolchain question decided via ARCHBP-029",
  !/OPEN QUESTION \(undecided\)/.test(portabilityModel) && /ARCHBP-029/.test(portabilityModel));

if (failures.length > 0) {
  console.error(`\nARCHBP-029 gate: ${failures.length} clause(s) unsatisfied`);
  process.exit(1);
}
console.log("\nARCHBP-029 gate: all clauses satisfied");
