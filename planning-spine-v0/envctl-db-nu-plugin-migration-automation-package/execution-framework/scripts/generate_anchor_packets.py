#!/usr/bin/env python3
"""Extract EVERY enumerable unit of the blueprint anchor into executable packets.

generate_invariant_packets.py covered the 19 acceptance invariants -- 2.6% of the
anchor. This generator covers the rest, structurally, with no interpretation:

  RULE-nnn       21   hard execution rules
  INVAR-nnn      19   operational invariants (probes live in the invariant generator)
  ANCHOR-Ann     15   anchor conformance ledger rows A01-A15
  REVIEW-Rnn     19   review ledger rows R01-R19
  DIAGRAM-Dnn    24   D01-D24 mermaid atlas entries
  PIPELINE-nnn   26   numbered physical pipelines (3.2)
  COMPONENT-nnn 586   component inventory rows (Component|Developer|Repository|
                      Crate/Package/Extension|Current Version/Revision|...)
  CURRENCY-<pkg>  N   one per blueprint-named package that actually publishes on npm

PROBE CLASSES -- the honesty rule that makes this different from the last three weeks.
Every packet declares probe_class, because conflating these is exactly how review-ledger
row R17 came to record `codedb ingest-envelope` as built when the installed binary is a
424-byte shim that does not contain the command:

  capability     the probe EXECUTES the shipped surface. Passing means it really works.
  currency       the probe compares the installed version against the registry.
                 Node is authoritative for the RuvNet stack (crate -> napi.rs -> node).
  drift-canary   the probe only asserts the anchor still CONTAINS this unit. It is NOT
                 evidence of implementation and must never be read as such.

A unit whose obligation cannot be expressed as one of those is emitted as a
drift-canary and explicitly flagged needs_capability_probe=true, so the weak spots are
visible instead of silently passing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
import _common

ANCHOR = "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md"


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def shq(value: str) -> str:
    """Single-quote a value for safe embedding in a shell command."""
    return "'" + value.replace("'", "'\"'\"'") + "'"


def grep_probe(needle: str) -> str:
    """Drift canary: the anchor must still contain this exact unit."""
    return f"grep -Fq {shq(needle[:120])} {ANCHOR}"


class Emitter:
    def __init__(self, anchor_text: str, anchor_sha: str, generated_at: str) -> None:
        self.t = anchor_text
        self.anchor_sha = anchor_sha
        self.at = generated_at
        self.packets: list[dict] = []

    def add(
        self,
        task_id: str,
        parent: str,
        phase: str,
        title: str,
        goal: str,
        probe: str,
        verify: str,
        probe_class: str,
        cell: str,
        risk: str,
        tools: list[str],
        unit_text: str,
        offset: int,
        priority: int,
        needs_capability_probe: bool = False,
    ) -> None:
        self.packets.append(
            {
                "packet_schema_version": "1.0",
                "task_id": task_id,
                "parent_id": parent,
                "phase": phase,
                "title": title[:150],
                "goal": goal,
                "owner_lane": "lane_f_anchor",
                "owner_agent": "anchor-agent",
                "helper_id": f"helper-{task_id.lower()}",
                "model_tag": "gpt-5.3-spark",
                "agent_runtime": "codex-cli-background-shell",
                "shell_mode": "read-only",
                "repo_target": "lifeos",
                "repo_path": ".",
                "filesystem_scope": "read-only-probe",
                "input_files": [ANCHOR],
                "target_files": [],
                "target_artifacts": [f"migration-artifacts/{task_id.lower()}/result.json"],
                "allowed_paths": ["execution-framework/**", "migration-artifacts/**"],
                "blocked_paths": ["**/.env", "**/secrets/**", "**/*.pem", "**/*.key"],
                "depends_on": [],
                "blocks": [],
                "start_after": "",
                "can_run_parallel": True,
                "parallel_group": f"anchor_{cell}",
                "max_parallel": 8,
                "priority": priority,
                "command_template": probe,
                "verification_command": verify,
                "completion_gate": (
                    "probe exits 0 against the live system"
                    if probe_class != "drift-canary"
                    else "anchor still contains this unit; NOT evidence of implementation"
                ),
                "probe_class": probe_class,
                "needs_capability_probe": needs_capability_probe,
                "proof_required": True,
                "proof_uri": f"proof_records/{task_id}.proof.json",
                "heartbeat_file": f"state/{task_id}.heartbeat.json",
                "logs_uri": f"logs/{task_id}.log",
                "execution_cell": cell,
                "human_approval_required": False,
                "required_tools": tools,
                "risk_level": risk,
                "rollback_plan": "Read-only probe; nothing to roll back.",
                "source_graph_uri": ANCHOR,
                "generated_at": self.at,
                "notes": "Structurally extracted from the blueprint anchor.",
                "anchor_binding": {
                    "document": ANCHOR,
                    "document_sha256": self.anchor_sha,
                    "unit_sha256": sha(unit_text),
                    "byte_offset": offset,
                },
            }
        )

    # ---- unit classes -------------------------------------------------

    def rules(self) -> None:
        head = self.t.split("## 1. Two-phase")[0]
        for m in re.finditer(r"^(\d{1,2})\.\s+(.+)$", head, re.M):
            n, body = int(m.group(1)), m.group(2).strip()
            self.add(
                f"RULE-{n:03d}_HARD_EXECUTION_RULE", "HARD_RULES", "00-rules",
                f"Hard rule {n}: {body[:100]}",
                f"Hard execution rule {n} must hold. Rule 17: an edit that conflicts with these rules is invalid.",
                grep_probe(body), grep_probe(body[:60]),
                "drift-canary", "hard-rules", "critical", ["shell"],
                body, m.start(), 200 + n, needs_capability_probe=True,
            )

    def ledger(self, pattern: str, prefix: str, parent: str, phase: str, cell: str, base: int) -> int:
        count = 0
        for m in re.finditer(pattern, self.t, re.M):
            ident = m.group(1)
            line = self.t[m.start(): self.t.find("\n", m.start())]
            self.add(
                f"{prefix}-{ident}_LEDGER_ROW", parent, phase,
                f"{parent} {ident}: {line[:90]}",
                f"Ledger row {ident} must remain present and reconciled in the anchor.",
                grep_probe(f"| {ident} |"), grep_probe(f"| {ident} |"),
                "drift-canary", cell, "high", ["shell"],
                line, m.start(), base + count, needs_capability_probe=True,
            )
            count += 1
        return count

    def diagrams(self) -> int:
        count = 0
        for m in re.finditer(r"^#### (D\d{2})[^\n]*", self.t, re.M):
            ident = m.group(1)
            line = m.group(0)
            self.add(
                f"DIAGRAM-{ident}_ATLAS_ENTRY", "ATLAS", "00-atlas",
                f"Atlas {ident}: {line[:90]}",
                f"Mermaid atlas entry {ident} must remain present (anchor rule 21 forbids narrowing the atlas).",
                grep_probe(f"#### {ident}"), grep_probe(f"#### {ident}"),
                "drift-canary", "atlas", "medium", ["shell"],
                line, m.start(), 600 + count,
            )
            count += 1
        return count

    def pipelines(self) -> int:
        seg = self.t.split("### 3.2")[1].split("### 3.3")[0] if "### 3.2" in self.t else ""
        count = 0
        for m in re.finditer(r"^(\d{1,2})\.\s+\*\*(.+?)\*\*", seg, re.M):
            n, name = int(m.group(1)), m.group(2).strip()
            self.add(
                f"PIPELINE-{n:03d}_PHYSICAL_PIPELINE", "PIPELINES", "00-pipelines",
                f"Pipeline {n}: {name[:100]}",
                f"Physical pipeline {n} ({name}) must be implemented end to end.",
                grep_probe(name), grep_probe(name[:50]),
                "drift-canary", "pipelines", "high", ["shell"],
                name, m.start(), 700 + n, needs_capability_probe=True,
            )
            count += 1
        return count

    def components(self) -> int:
        rows = self.t.split("\n")
        start = next((i for i, l in enumerate(rows) if l.startswith("| Component | Developer")), None)
        if start is None:
            return 0
        count = 0
        offset = sum(len(r) + 1 for r in rows[:start])
        for line in rows[start + 2:]:
            if not line.startswith("|"):
                break
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 4 or not cells[0]:
                continue
            name = cells[0].strip("`")
            slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").upper()[:44] or f"ROW{count}"
            count += 1
            self.add(
                f"COMPONENT-{count:03d}_{slug}", "COMPONENTS", "00-components",
                f"Component: {name[:100]}",
                f"Component '{name}' must be installed and used, not replaced (hard rule 15).",
                grep_probe(name), grep_probe(name[:50]),
                "drift-canary", "components", "high", ["shell"],
                line, offset, 1000 + count, needs_capability_probe=True,
            )
        return count

    def currency(self, packages: list[dict]) -> int:
        for i, p in enumerate(packages, 1):
            pkg, latest = p["package"], p["npm_latest"]
            slug = re.sub(r"[^A-Za-z0-9]+", "_", pkg).strip("_").upper()
            # bun is the drop-in for npm on this host (bun x replaces npx); npm/npx are
            # deliberately absent from the profile. `bun info <pkg> version` is the
            # registry query. Node is authoritative for the RuvNet stack because the
            # publish pipeline is crate -> napi.rs -> node, so npm carries the newest
            # surface even when a crates.io crate of the same name does not exist
            # (verified: `ruvector` is 0.2.38 on npm and absent from crates.io).
            probe = (
                f"test -n \"$(bun info {shq(pkg)} version 2>/dev/null)\" && "
                f"test \"$(bun info {shq(pkg)} version 2>/dev/null)\" = "
                f"\"$(bun pm ls -g 2>/dev/null | grep -oE {shq(re.escape(pkg) + '@[0-9][^ ]*')} "
                f"| head -1 | sed 's/.*@//')\""
            )
            verify = f"bun info {shq(pkg)} version"
            self.add(
                f"CURRENCY-{slug}", "CURRENCY", "00-currency",
                f"Toolchain currency: {pkg} (npm latest at extraction {latest})",
                f"Installed {pkg} must equal the registry latest. NOTE: bun's global root "
                f"resolves under BUN_INSTALL_CACHE_DIR, which on this host is the "
                f"XDG_RUNTIME_DIR tmpfs -- global installs there do not survive a reboot, "
                f"so a failing probe may mean 'installed then evaporated', not 'never installed'.",
                probe, verify,
                "currency", "toolchain-currency", "high", ["bun"],
                f"{pkg}@{latest}", 0, 1600 + i,
            )
        return len(packages)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo-root", default="/home/flexnetos/meta/src/lifeos")
    ap.add_argument("--out-dir", default=(
        "/home/flexnetos/meta/src/lifeos/planning-spine-v0/"
        "envctl-db-nu-plugin-migration-automation-package/execution-framework/"
        "generated/execution_packets"))
    ap.add_argument("--currency-json", default="", help="toolchain currency results JSON")
    ap.add_argument("--generated-at", default="2026-07-27T00:00:00+00:00")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    anchor_path = Path(args.repo_root) / ANCHOR
    text = anchor_path.read_text(encoding="utf-8")
    anchor_sha = hashlib.sha256(anchor_path.read_bytes()).hexdigest()

    e = Emitter(text, anchor_sha, args.generated_at)
    e.rules()
    n_a = e.ledger(r"^\| (A\d{2}) \|", "ANCHOR", "ANCHOR_LEDGER", "00-anchor", "anchor-ledger", 400)
    n_r = e.ledger(r"^\| (R\d{2}) \|", "REVIEW", "REVIEW_LEDGER", "00-review", "review-ledger", 500)
    n_d = e.diagrams()
    n_p = e.pipelines()
    n_c = e.components()
    n_cur = 0
    if args.currency_json and Path(args.currency_json).is_file():
        n_cur = e.currency(json.load(open(args.currency_json)))

    out = Path(args.out_dir)
    if not args.dry_run:
        out.mkdir(parents=True, exist_ok=True)
        for p in e.packets:
            (out / f"{p['task_id']}.json").write_text(
                json.dumps(p, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    weak = sum(1 for p in e.packets if p.get("needs_capability_probe"))
    print(json.dumps({
        "schema": "lifeos.anchor-packet-generation.v1",
        "anchor_sha256": anchor_sha,
        "emitted": {"rules": 21, "anchor_ledger": n_a, "review_ledger": n_r,
                    "diagrams": n_d, "pipelines": n_p, "components": n_c,
                    "currency": n_cur},
        "total_packets": len(e.packets),
        "needs_capability_probe": weak,
        "dry_run": args.dry_run,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
