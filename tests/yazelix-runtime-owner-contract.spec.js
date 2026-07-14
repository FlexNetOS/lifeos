import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const packageRoot = path.join(repoRoot, "planning-spine-v0", "yazelix_runtime_convergence");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const [header, ...records] = rows;
  return records.filter((record) => record.some(Boolean)).map((record) => (
    Object.fromEntries(header.map((field, index) => [field, record[index] ?? ""]))
  ));
}

describe("Yazelix runtime owner contract", () => {
  const tasks = parseCsv(fs.readFileSync(path.join(packageRoot, "task_graph.source.csv"), "utf8"));
  const byId = Object.fromEntries(tasks.map((task) => [task.task_id, task]));

  it("adds active tasks for the complete owner-directed runtime contract", () => {
    expect(tasks.map(({ task_id: taskId }) => taskId)).toEqual(
      Array.from({ length: 33 }, (_, index) => `YZXCONV-${String(index + 1).padStart(3, "0")}`),
    );

    for (const task of tasks) {
      expect(task.status.toLowerCase()).not.toBe("draft");
    }

    for (const taskId of ["YZXCONV-016", "YZXCONV-017", "YZXCONV-018", "YZXCONV-019", "YZXCONV-020", "YZXCONV-021", "YZXCONV-022"]) {
      expect(byId[taskId]).toBeDefined();
      expect(byId[taskId].status.toLowerCase()).not.toBe("draft");
      expect(byId[taskId].verification_gate).toBeTruthy();
      expect(byId[taskId].rollback_plan).toBeTruthy();
      expect(byId[taskId].proof_uri).toContain(taskId);
    }

    expect(`${byId["YZXCONV-016"].title} ${byId["YZXCONV-016"].goal} ${byId["YZXCONV-016"].verification_gate}`).toMatch(/Kache/i);
    expect(`${byId["YZXCONV-017"].title} ${byId["YZXCONV-017"].goal} ${byId["YZXCONV-017"].verification_gate}`).toMatch(/Nushell/i);
    expect(`${byId["YZXCONV-017"].goal} ${byId["YZXCONV-017"].verification_gate}`).toMatch(/owner.*emergency|emergency.*owner/i);
    expect(`${byId["YZXCONV-018"].title} ${byId["YZXCONV-018"].goal}`).toMatch(/agent-env/i);
    expect(`${byId["YZXCONV-019"].title} ${byId["YZXCONV-019"].goal}`).toMatch(/worktree/i);
    expect(`${byId["YZXCONV-019"].goal} ${byId["YZXCONV-019"].verification_gate}`).toMatch(/stash/i);
    expect(`${byId["YZXCONV-019"].goal} ${byId["YZXCONV-019"].verification_gate}`).toMatch(/branch/i);
    expect(`${byId["YZXCONV-019"].goal} ${byId["YZXCONV-019"].verification_gate}`).toMatch(/pull request|PR/i);
    expect(byId["YZXCONV-020"].parent_id).toContain("YZXCONV-019");
    expect(byId["YZXCONV-020"].parent_id).toContain("YZXCONV-021");
    expect(byId["YZXCONV-020"].parent_id).toContain("YZXCONV-022");
    expect(`${byId["YZXCONV-021"].title} ${byId["YZXCONV-021"].goal} ${byId["YZXCONV-021"].verification_gate}`).toMatch(/musl/i);
    expect(`${byId["YZXCONV-021"].goal} ${byId["YZXCONV-021"].verification_gate}`).toMatch(/TDD|Red tests/i);
    expect(`${byId["YZXCONV-022"].title} ${byId["YZXCONV-022"].goal} ${byId["YZXCONV-022"].verification_gate}`).toMatch(/Home Manager/i);
    expect(`${byId["YZXCONV-022"].goal} ${byId["YZXCONV-022"].verification_gate}`).toMatch(/one.*profile|profile.*one/i);
  });

  it("makes YZXCONV-020 the only completion authority for this package", () => {
    const readme = fs.readFileSync(path.join(packageRoot, "README.md"), "utf8");
    const plan = fs.readFileSync(path.join(packageRoot, "PLAN.md"), "utf8");

    expect(readme).toContain("Runtime convergence is complete only after `YZXCONV-020`");
    expect(plan).toContain("Kache");
    expect(plan).toContain("owner-authorized emergency");
    expect(plan).toContain("worktree");
    expect(plan).toContain("stash");
    expect(plan).toContain("pull request");
    expect(plan).toContain("musl");
    expect(plan).toContain("Home Manager");
    expect(plan).toContain("YZXCONV-021");
    expect(plan).toContain("YZXCONV-022");
    expect(plan).toContain("YZXCONV-020");
  });

  it("regenerates this package only through the profile-owned Nushell", () => {
    const readme = fs.readFileSync(path.join(packageRoot, "README.md"), "utf8");
    const regenerator = path.join(
      repoRoot,
      "planning-spine-v0",
      "scripts",
      "regenerate-yazelix-runtime-convergence.nu",
    );

    expect(fs.existsSync(regenerator)).toBe(true);
    expect(readme).not.toContain("python3");
    expect(readme).toContain("/home/flexnetos/.nix-profile/bin/rtk proxy");
    expect(readme).toContain("/home/flexnetos/.nix-profile/toolbin/nu");
  });
});
