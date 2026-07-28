// Run the three live Ruvnet boundary verifiers in a deterministic order.
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = process.cwd();
const supplied = process.argv.find((argument) => argument.startsWith("--output="));
const outputPath = resolve(root, supplied ? supplied.slice("--output=".length) : "evidence/nbverify/NBVERIFY-004.local-evidence.json");
for (const name of ["claim005", "claim006", "claim007"]) {
  execFileSync("bun", [join(root, `scripts/verify-nbverify004-${name}.mjs`), `--output=${outputPath}`], { cwd: root, stdio: "inherit" });
}
console.log(JSON.stringify({ claim_ids: ["SWARM-CLAIM-005", "SWARM-CLAIM-006", "SWARM-CLAIM-007"], output: outputPath }, null, 2));
