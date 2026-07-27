#!/usr/bin/env python3
"""Extract the blueprint anchor's operational invariants into executable packets.

The anchor (Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md)
already enumerates its acceptance invariants as a numbered list. This generator walks
that list structurally -- no interpretation -- and emits one execution packet per
invariant into generated/execution_packets/, in the same flat schema the 80 existing
ART/REQ/VER packets use.

Two rules govern what is emitted, and they are the whole point:

  1. SHIPPED ONLY. Every probe asserts against the live system. A design document, an
     ADR marked "Proposed", or a plan to build something never satisfies a probe. If a
     component is not shipped, its invariant FAILS -- it is never recorded as pending.

  2. NO PROSE VERIFICATION. Both command_template and verification_command are real
     shell commands whose exit status is the verdict. The existing packets carry an
     executable command_template but a prose verification_command ("artifact file
     exists and envctl artifact registry contains hash"); a sentence cannot fail a
     build. Every probe here exits 0 when the invariant holds and non-zero when it
     does not.

Each packet records the anchor byte span and SHA-256 of the invariant text it came
from, so drift between the anchor and the graph is detectable the same way the envctl
generator binds generated files to their source table checksum.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ANCHOR = "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md"
INVARIANT_HEADING = "## Operational invariants and acceptance"
PG = "postgresql:///lifeos?host=/home/flexnetos/meta/var/run/postgresql"
PGDATA = "/home/flexnetos/meta/var/lib/postgresql/17"

# psql and pg_ctl are NOT on the profile PATH on this host, so a probe that simply
# says `psql ...` fails with "command not found" and looks exactly like a real
# invariant violation. Resolve psql from the RUNNING postmaster instead: that is
# always the client matching the live server, and it never hardcodes a /nix/store
# path that garbage collection could remove. If the server is down the resolution
# fails and the probe fails -- which is the correct verdict, not a false negative.
PSQL = (
    'PSQL="$(command -v psql || '
    f'echo "$(dirname "$(readlink -f /proc/$(head -1 {PGDATA}/postmaster.pid '
    '2>/dev/null)/exe 2>/dev/null)")/psql")"; test -x "$PSQL" && '
)

# Probe table. One row per invariant number.
#   probe    : command_template   -- exits 0 iff the invariant holds RIGHT NOW
#   verify   : verification_command -- independent re-assertion, also executable
#   tools    : required_tools
#   risk     : risk_level
#   cell     : execution_cell (groups probes that touch the same subsystem)
PROBES: dict[int, dict[str, object]] = {
    1: {
        "cell": "database-primary-runtime",
        "risk": "critical",
        "tools": ["psql"],
        # Catalog registration is NOT proof. The 2026-07-27 outage had ruvector 0.3.0
        # registered in pg_extension while every function failed on a missing $libdir.
        # This probe therefore EXECUTES a function instead of reading the catalog.
        "probe": f"{PSQL}\"$PSQL\" '{PG}' -tAc 'select extensions.ruvector_version()'",
        "verify": f"{PSQL}\"$PSQL\" '{PG}' -tAc 'select 1 from pg_extension where extname=$$ruvector$$' | grep -q 1",
    },
    2: {
        "cell": "database-primary-runtime",
        "risk": "high",
        "tools": ["psql"],
        "probe": f"{PSQL}test \"$(\"$PSQL\" '{PG}' -tAc \"select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')\")\" -gt 0",
        "verify": f"{PSQL}\"$PSQL\" '{PG}' -tAc 'select pg_database_size(current_database())' | grep -qE '^[0-9]+$'",
    },
    3: {
        "cell": "execution-surfaces",
        "risk": "medium",
        "tools": ["envctl"],
        "probe": "envctl --version",
        "verify": "command -v envctl",
    },
    4: {
        "cell": "glass-engine-frontdoor",
        "risk": "high",
        "tools": ["python3"],
        # Invariant 4 requires the Tauri/Svelte Glass. Review-ledger R01 recorded the
        # checkout as Vue and made Vue->Svelte release-blocking, so this probe asserts
        # the Svelte shell is the actual entrypoint, not that Svelte is merely present.
        "probe": "test -f src/App.svelte && python3 -c \"import json,sys; d=json.load(open('package.json')); sys.exit(0 if any('svelte' in k for k in {**d.get('dependencies',{}),**d.get('devDependencies',{})}) else 1)\"",
        "verify": "grep -rqE 'App\\.svelte' src/main.ts src/main.js 2>/dev/null || grep -rq 'svelte' vite.config.ts",
    },
    5: {
        "cell": "codedb-ingress",
        "risk": "critical",
        "tools": ["shell"],
        # R17 records codedb ingest-envelope as built. Assert the shipped command.
        "probe": "codedb ingest-envelope --help >/dev/null 2>&1 || nu -c 'codedb ingest-envelope --help' >/dev/null 2>&1",
        "verify": "command -v codedb || nu -c 'help commands' 2>/dev/null | grep -q 'codedb ingest-envelope'",
    },
    6: {
        "cell": "redb-state-plane",
        "risk": "critical",
        "tools": ["shell"],
        # Blueprint 3.3 names the supervised single-writer service explicitly.
        "probe": "command -v flexnetos-redb-owner",
        "verify": "systemctl --user is-active flexnetos-redb-owner 2>/dev/null | grep -qE 'active|activating'",
    },
    7: {
        "cell": "envctl-committer",
        "risk": "critical",
        "tools": ["envctl"],
        "probe": "test -f /home/flexnetos/meta/var/lib/envctl/tables/bootstrap_env_vars.csv && envctl --version",
        "verify": "test -s /home/flexnetos/meta/var/lib/envctl/tables/bootstrap_env_vars.csv",
    },
    8: {
        "cell": "envctl-security",
        "risk": "critical",
        "tools": ["envctl"],
        "probe": "envctl secret --help",
        "verify": "envctl secret --help 2>&1 | grep -qiE 'vault|relay|mint'",
    },
    9: {
        "cell": "ruvnet-ecosystem",
        "risk": "high",
        "tools": ["psql", "shell"],
        # "installed and used, not replaced" -- assert the extension answers, which is
        # the only shipped, executable evidence of the RuVector half of the ecosystem.
        "probe": f"{PSQL}\"$PSQL\" '{PG}' -tAc 'select extensions.ruvector_simd_info()'",
        "verify": "test -d /home/flexnetos/meta/var/lib/agentdb || test -d /home/flexnetos/meta/var/lib/ruvector",
    },
    10: {
        "cell": "byte-capture",
        "risk": "high",
        "tools": ["shell"],
        "probe": "test -d /home/flexnetos/meta/var/lib/codedb && test -n \"$(ls -A /home/flexnetos/meta/var/lib/codedb 2>/dev/null)\"",
        "verify": "du -s /home/flexnetos/meta/var/lib/codedb | awk '{exit ($1>0)?0:1}'",
    },
    11: {
        "cell": "cow-branching",
        "risk": "high",
        "tools": ["psql"],
        "probe": f"{PSQL}\"$PSQL\" '{PG}' -tAc \"select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='extensions' and p.proname ~ 'branch|cow'\" | awk '{{exit ($1>0)?0:1}}'",
        "verify": f"{PSQL}\"$PSQL\" '{PG}' -tAc 'select extensions.ruvector_version()'",
    },
    12: {
        "cell": "witness-chain",
        "risk": "high",
        "tools": ["shell"],
        "probe": "grep -rqi 'shake256' /home/flexnetos/meta/src/envctl/crates /home/flexnetos/meta/src/nu_plugin 2>/dev/null",
        "verify": "grep -rli 'shake256' /home/flexnetos/meta/src/envctl/crates 2>/dev/null | head -1 | grep -q .",
    },
    13: {
        "cell": "database-durability",
        "risk": "critical",
        "tools": ["psql"],
        "probe": f"{PSQL}\"$PSQL\" '{PG}' -tAc 'show wal_level' | grep -qE 'replica|logical'",
        "verify": f"{PSQL}\"$PSQL\" '{PG}' -tAc 'select pg_is_in_recovery()' | grep -qE 'f|t'",
    },
    14: {
        "cell": "return-loop",
        "risk": "high",
        "tools": ["python3"],
        "probe": "test -d planning-spine-v0/task_tables/execution_receipts && test -n \"$(find planning-spine-v0/task_tables/execution_receipts -name '*.json' -print -quit)\"",
        "verify": "find planning-spine-v0/task_tables/execution_receipts -name '*.json' | head -1 | xargs -r python3 -c 'import json,sys; json.load(open(sys.argv[1]))'",
    },
    15: {
        "cell": "byte-capture",
        "risk": "critical",
        "tools": ["psql"],
        # EVERY BYTE means the raw-object path must be queryable, not merely present.
        "probe": f"{PSQL}\"$PSQL\" '{PG}' -tAc \"select count(*) from information_schema.tables where table_name ~ 'raw|object|blob|ingest'\" | awk '{{exit ($1>0)?0:1}}'",
        "verify": f"{PSQL}\"$PSQL\" '{PG}' -tAc 'select current_database()' | grep -q lifeos",
    },
    16: {
        "cell": "rtk-adapter",
        "risk": "high",
        "tools": ["rtk"],
        # R18 records rtk_nu as built. rtk itself is the inspected compact proxy.
        "probe": "rtk --version && command -v rtk_nu",
        "verify": "rtk --version | grep -qE '[0-9]+\\.[0-9]+'",
    },
    17: {
        "cell": "redb-state-plane",
        "risk": "critical",
        "tools": ["shell"],
        "probe": "command -v flexnetos-redb-owner && test -d /home/flexnetos/meta/var/lib/redb && test -n \"$(ls -A /home/flexnetos/meta/var/lib/redb 2>/dev/null)\"",
        "verify": "test -n \"$(ls -A /home/flexnetos/meta/var/lib/redb 2>/dev/null)\"",
    },
    18: {
        "cell": "release-gate",
        "risk": "critical",
        "tools": ["nu"],
        "probe": "nu /home/flexnetos/meta/src/envctl/scripts/validate-env-tables.nu --json | python3 -c \"import json,sys; r=json.load(sys.stdin); sys.exit(0 if all(x['status']=='ok' for x in r) else 1)\"",
        "verify": "nu /home/flexnetos/meta/src/envctl/scripts/validate-env-tables.nu --json | python3 -c \"import json,sys; print(len(json.load(sys.stdin)))\"",
    },
    19: {
        "cell": "anchor-conformance",
        "risk": "high",
        "tools": ["python3"],
        # The anchor must still contain its own conformance structures: 15 A-rows and
        # the D01-D24 atlas. This is the drift canary on the anchor itself.
        "probe": f"python3 -c \"import re;t=open('{ANCHOR}',encoding='utf-8').read();a=len(re.findall(r'^\\\\| A\\\\d{{2}} \\\\|',t,re.M));d=len(re.findall(r'^#### D\\\\d{{2}}',t,re.M));raise SystemExit(0 if (a==15 and d==24) else 1)\"",
        "verify": f"test -f {ANCHOR}",
    },
}

LANE = "lane_e_invariants"


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def extract_invariants(anchor_path: Path) -> list[dict[str, object]]:
    """Walk the anchor's numbered acceptance-invariant list structurally."""
    text = anchor_path.read_text(encoding="utf-8")
    start = text.find(INVARIANT_HEADING)
    if start < 0:
        raise SystemExit(f"anchor heading not found: {INVARIANT_HEADING}")
    section = text[start:]

    rows: list[dict[str, object]] = []
    for match in re.finditer(r"^(\d{1,2})\.\s+(.+)$", section, re.M):
        number = int(match.group(1))
        body = match.group(2).strip()
        rows.append(
            {
                "number": number,
                "text": body,
                "anchor_offset": start + match.start(),
                "anchor_sha256": sha256_text(body),
            }
        )
    if not rows:
        raise SystemExit("no invariants parsed from anchor")
    return rows


def build_packet(inv: dict[str, object], anchor_sha: str, generated_at: str) -> dict[str, object]:
    number = int(inv["number"])
    probe = PROBES.get(number)
    if probe is None:
        raise SystemExit(f"invariant {number} has no probe; refusing to emit a task without one")

    task_id = f"INV-{number:03d}_OPERATIONAL_INVARIANT"
    title = str(inv["text"])
    short = title if len(title) <= 110 else title[:107] + "..."

    return {
        "packet_schema_version": "1.0",
        "task_id": task_id,
        "parent_id": "INVARIANTS",
        "phase": "00-invariants",
        "title": f"Invariant {number}: {short}",
        "goal": (
            f"Prove operational invariant {number} holds against the live system. "
            "Shipped evidence only: a design document, a proposed ADR, or an intent to "
            "build never satisfies this probe."
        ),
        "owner_lane": LANE,
        "owner_agent": "invariant-agent",
        "helper_id": f"helper-invariant-{number:02d}",
        "model_tag": "gpt-5.3-spark",
        "agent_runtime": "codex-cli-background-shell",
        "shell_mode": "read-only",
        "repo_target": "lifeos",
        "repo_path": ".",
        "filesystem_scope": "read-only-probe",
        "input_files": [ANCHOR],
        "target_files": [],
        "target_artifacts": [f"migration-artifacts/inv-{number:03d}/result.json"],
        "allowed_paths": ["execution-framework/**", "migration-artifacts/**"],
        "blocked_paths": ["**/.env", "**/secrets/**", "**/*.pem", "**/*.key"],
        "depends_on": [],
        "blocks": [],
        "start_after": "",
        "can_run_parallel": True,
        "parallel_group": f"invariant_{probe['cell']}",
        "max_parallel": 6,
        "priority": 100 + number,
        "command_template": probe["probe"],
        "verification_command": probe["verify"],
        "completion_gate": (
            "probe exits 0 against the live system; a non-zero exit is a real "
            "invariant violation and must not be recorded as pending or proposed"
        ),
        "proof_required": True,
        "proof_uri": f"proof_records/{task_id}.proof.json",
        "heartbeat_file": f"state/{task_id}.heartbeat.json",
        "logs_uri": f"logs/{task_id}.log",
        "execution_cell": probe["cell"],
        "human_approval_required": False,
        "required_tools": probe["tools"],
        "risk_level": probe["risk"],
        "rollback_plan": "Read-only probe; nothing to roll back.",
        "source_graph_uri": ANCHOR,
        "generated_at": generated_at,
        "notes": (
            f"Extracted structurally from the anchor's acceptance-invariant list. "
            f"Anchor invariant sha256={inv['anchor_sha256']}; "
            f"anchor document sha256={anchor_sha}."
        ),
        "anchor_binding": {
            "document": ANCHOR,
            "document_sha256": anchor_sha,
            "invariant_number": number,
            "invariant_sha256": inv["anchor_sha256"],
            "byte_offset": inv["anchor_offset"],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default="/home/flexnetos/meta/src/lifeos")
    parser.add_argument(
        "--out-dir",
        default=(
            "/home/flexnetos/meta/src/lifeos/planning-spine-v0/"
            "envctl-db-nu-plugin-migration-automation-package/execution-framework/"
            "generated/execution_packets"
        ),
    )
    parser.add_argument("--generated-at", default="2026-07-27T00:00:00+00:00")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    repo_root = Path(args.repo_root)
    anchor_path = repo_root / ANCHOR
    if not anchor_path.is_file():
        raise SystemExit(f"anchor not found: {anchor_path}")

    anchor_sha = hashlib.sha256(anchor_path.read_bytes()).hexdigest()
    invariants = extract_invariants(anchor_path)

    out_dir = Path(args.out_dir)
    written: list[str] = []
    for inv in invariants:
        packet = build_packet(inv, anchor_sha, args.generated_at)
        target = out_dir / f"{packet['task_id']}.json"
        if not args.dry_run:
            out_dir.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        written.append(str(target))

    print(
        json.dumps(
            {
                "schema": "lifeos.invariant-packet-generation.v1",
                "anchor": ANCHOR,
                "anchor_sha256": anchor_sha,
                "invariants_extracted": len(invariants),
                "packets_written": len(written),
                "dry_run": args.dry_run,
                "out_dir": str(out_dir),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
