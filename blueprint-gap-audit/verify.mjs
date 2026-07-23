#!/usr/bin/env node
// Blueprint gap-audit verifier. Every gate is an exit code, not an opinion.
// Usage: node blueprint-gap-audit/verify.mjs <specify|plan|structure|refine|complete|all>
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BP = join(HERE, '..', 'Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md');
const INVENTORY = join(HERE, 'inventory.md');
const CLOSURE = join(HERE, 'closure.md');

// Structural baseline established in Phase S (regression guard).
const BASELINE_BYTES = 970000; // blueprint was 974321 B pre-edit; edits are additive, so >= this.
const FINDING_IDS = ['RECON-01', 'RECON-02', 'RECON-03', 'CONSIST-01'];

const phase = process.argv[2] || 'all';
const results = [];
const check = (name, cond, detail = '') =>
  results.push({ name, ok: !!cond, detail });

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const bp = read(BP);

function sectionBetween(text, startRe, endRe) {
  const s = text.search(startRe);
  if (s < 0) return '';
  const rest = text.slice(s);
  const e = rest.slice(1).search(endRe);
  return e < 0 ? rest : rest.slice(0, e + 1);
}
function countNumbered(block) {
  const m = block.match(/^\s*(\d+)\.\s+\S/gm) || [];
  return m.length;
}

function structure() {
  check('blueprint exists', bp !== null);
  if (!bp) return;
  const rules = sectionBetween(bp, /## HARD EXECUTION RULES/, /\n## /);
  check('HARD RULES == 21', countNumbered(rules) === 21, `got ${countNumbered(rules)}`);
  const inv = sectionBetween(bp, /## Operational invariants and acceptance/, /\n## /);
  check('acceptance invariants == 19', countNumbered(inv) === 19, `got ${countNumbered(inv)}`);
  const aRows = (bp.match(/^\| A\d\d \|/gm) || []).length;
  check('anchor ledger rows == 15', aRows === 15, `got ${aRows}`);
  const rRows = (bp.match(/^\| R\d\d \|/gm) || []).length;
  check('review ledger rows >= 16', rRows >= 16, `got ${rRows}`);
  check('anchor SHA abd36f1c present', bp.includes('abd36f1c'));
  check('no placeholder markers',
    !/\b(TODO|TBD|FIXME|PLACEHOLDER)\b/.test(bp) && !bp.includes('???'));
  const subs = (bp.match(/^### \d+\. /gm) || []).length;
  check('component-arch subsections >= 20', subs >= 20, `got ${subs}`);
  check('blueprint byte-length >= baseline', statSync(BP).size >= BASELINE_BYTES,
    `${statSync(BP).size}`);
}

function specify() {
  const inv = read(INVENTORY);
  check('inventory.md exists', inv !== null);
  if (inv) for (const id of FINDING_IDS)
    check(`inventory has ${id}`, inv.includes(id));
  if (inv) check('every finding cites file evidence',
    FINDING_IDS.every((id) => {
      const seg = inv.slice(inv.indexOf(id));
      return /\*\*Evidence/i.test(seg.slice(0, 1200));
    }));
}

function plan() {
  const cl = read(CLOSURE);
  check('closure.md exists', cl !== null);
  if (cl) for (const id of FINDING_IDS)
    check(`closure maps ${id}`, cl.includes(id) && /Closure:/i.test(cl.slice(cl.indexOf(id), cl.indexOf(id) + 1500)));
}

function refine() {
  if (!bp) { check('blueprint exists', false); return; }
  check('R17 reconciliation row present', /^\| R17 \|/m.test(bp));
  check('R18 reconciliation row present', /^\| R18 \|/m.test(bp));
  check('R17 cites ingest-envelope evidence', /R17[\s\S]{0,900}ingest-envelope/.test(bp));
  check('R18 cites rtk_nu evidence', /R18[\s\S]{0,900}rtk_nu/.test(bp));
  check('no gate weakened: invariant 16 intact',
    bp.includes('cannot be treated as implemented until its exact revision, schema, package closure, and witness are pinned'));
}

function complete() {
  const cl = read(CLOSURE);
  check('closure.md exists', cl !== null);
  if (cl) {
    const open = (cl.match(/status:\s*open/gi) || []).length;
    check('no finding left open (closed or tracked)', open === 0, `${open} open`);
  }
  refine();
}

const run = { structure, specify, plan, refine, complete };
if (phase === 'all') { structure(); specify(); plan(); refine(); complete(); }
else if (run[phase]) run[phase]();
else { console.error(`unknown phase: ${phase}`); process.exit(2); }

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} checks passed [phase=${phase}]`);
process.exit(failed ? 1 : 0);
