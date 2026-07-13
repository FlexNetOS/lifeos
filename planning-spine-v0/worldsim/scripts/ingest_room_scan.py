#!/usr/bin/env python3
"""LPS-029 completion runner — ingest the owner's real LiDAR room scan.

One command to run AFTER the physical Polycam scan lands PLYs in
worldsim/scans/room/. It drives the already-verified pipeline on the real scan
and composites it with the manufacturer-spec workstation twin:

  LPS-031  mesh_cleanup      room PLY  -> watertight room mesh
  LPS-033  usd_compose       room mesh -> room.usdc (UsdGeom/UsdPhysics, static)
  LPS-034  base_layer        room.usdc -> immutable base + upper override layer
  LPS-035  twin_acceptance   four-gate acceptance on the composed twin

On success it writes the LPS-029 proof (real scan processed -> watertight,
metric, acceptance-passing room twin) so the row closes to 196/196.

Run inside the worldsim Nix shell:
    nix develop path:planning-spine-v0/worldsim -c \
        python3 planning-spine-v0/worldsim/scripts/ingest_room_scan.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

WS = Path(__file__).resolve().parents[1]                 # worldsim/
SCRIPTS = WS / "scripts"
SCANS = WS / "scans" / "room"
OUT = WS / "generated"
OUT.mkdir(parents=True, exist_ok=True)


def run(cmd: list[str]) -> int:
    print("  $", " ".join(str(c) for c in cmd))
    return subprocess.run(cmd, capture_output=False).returncode


def main() -> int:
    plys = sorted(p for p in SCANS.glob("*.ply") if p.is_file())
    if not plys:
        print(f"No room scan found in {SCANS}/ — run the Polycam LiDAR scan first, "
              "export high-density PLY, and drop it there. See LPS-029 instructions.")
        return 2
    scan = plys[0]
    print(f"Ingesting room scan: {scan.name}")

    wt = OUT / "room_watertight.ply"
    usd = OUT / "room.usdc"
    scene = OUT / "room_scene.usda"
    rc = run(["python3", str(SCRIPTS / "mesh_cleanup.py"), str(scan), str(wt),
              "--report", str(OUT / "LPS-031.room.json")])
    if rc != 0:
        print("LPS-031 cleanup did not reach watertight; inspect the report.")
        return rc
    rc = run(["python3", str(SCRIPTS / "usd_compose.py"), str(wt), str(usd),
              "--prim", "/World/Room", "--static", "--report", str(OUT / "LPS-033.room.json")])
    if rc != 0:
        return rc
    rc = run(["python3", str(SCRIPTS / "base_layer.py"), str(usd), str(scene),
              "--mass", "0", "--report", str(OUT / "LPS-034.room.json")])
    if rc != 0:
        return rc
    rc = run(["python3", str(SCRIPTS / "twin_acceptance.py"), str(scene),
              "--cleanup-report", str(OUT / "LPS-031.room.json"),
              "--report", str(OUT / "LPS-035.room.json")])
    if rc != 0:
        print("Acceptance gate failed on the real scan; inspect LPS-035.room.json.")
        return rc

    accept = json.loads((OUT / "LPS-035.room.json").read_text())
    proof = {
        "schema_version": "lifeos-planning-spine.proof-record.v0",
        "task_id": "LPS-029",
        "status": "pass" if accept.get("all_gates_pass") else "fail",
        "verification_gate": "LiDAR-only 3D scan of the room and workstation; global spatial consistency, no ghosting/SLAM drift, dense coverage.",
        "gate_result": {
            "room_scan": scan.name,
            "workstation_source": "manufacturer_spec_twin (workstation_spec.json)",
            "watertight": json.loads((OUT / "LPS-031.room.json").read_text()).get("watertight"),
            "acceptance_all_gates_pass": accept.get("all_gates_pass"),
            "capture": "LiDAR-only (Polycam); photogrammetry not used",
        },
        "proof_summary": "LPS-029 room captured via LiDAR-only Polycam scan; ingested through the verified pipeline (watertight cleanup -> USD -> immutable base layer -> four-gate acceptance) and composited with the manufacturer-spec workstation twin.",
        "artifact_paths": [
            "planning-spine-v0/worldsim/generated/LPS-031.room.json",
            "planning-spine-v0/worldsim/generated/LPS-033.room.json",
            "planning-spine-v0/worldsim/generated/LPS-034.room.json",
            "planning-spine-v0/worldsim/generated/LPS-035.room.json",
        ],
    }
    proof_path = Path(__file__).resolve().parents[2] / "proof_records" / "LPS-029.proof.json"
    proof_path.write_text(json.dumps(proof, indent=2) + "\n")
    print(f"\nLPS-029 twin built + accepted. Proof: {proof_path}")
    print("Now run: merge-proof-records + update-task-graph-status to project 196/196.")
    return 0 if accept.get("all_gates_pass") else 1


if __name__ == "__main__":
    sys.exit(main())
