#!/usr/bin/env python3
"""LPS-031 — headless mesh cleanup to watertight.

Loads a raw PLY scan and applies the watertight cleanup sequence (dedup
faces/vertices -> remove unreferenced -> non-manifold repair -> close holes ->
Taubin smooth) through pymeshlab, then verifies the result is watertight
(zero boundary edges / zero holes) via topological measures. The equivalent
filter sequence is also published as filters/watertight_cleanup.mlx for GUI /
meshlabserver parity; this runner applies it via the version-stable snake_case
API so it is robust across MeshLab releases. Runs headless under
QT_QPA_PLATFORM=offscreen (exported by the worldsim Nix dev shell).

Usage:
    python3 mesh_cleanup.py <input.ply> <output.ply> [--report report.json]

Non-manifold repair intentionally runs before hole filling (per the LPS-031
gate); a hole-fill artifact inspection (boundary-edge delta) is recorded.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import pymeshlab


def hole_metrics(ms: pymeshlab.MeshSet) -> tuple[int, int]:
    """Return (boundary_edge_count, hole_count); (0, 0) == watertight."""
    topo = ms.get_topological_measures()
    edges = int(topo.get("boundary_edges", topo.get("number_boundary_edges", 0)) or 0)
    holes = int(topo.get("number_holes", topo.get("boundary_loops", 0)) or 0)
    return edges, holes


def clean_to_watertight(ms: pymeshlab.MeshSet) -> None:
    ms.meshing_remove_duplicate_faces()
    ms.meshing_remove_duplicate_vertices()
    ms.meshing_remove_unreferenced_vertices()
    ms.meshing_repair_non_manifold_edges()  # before hole filling, per the gate
    # Iterate hole-closing: a single pass leaves holes whose closure would have
    # self-intersected or that became reachable only after an adjacent hole
    # closed. Loop until watertight or no further progress. Drop the
    # self-intersection guard on later passes so residual boundaries close.
    prev = None
    for attempt in range(12):
        edges, holes = hole_metrics(ms)
        if edges == 0 and holes == 0:
            break
        if prev is not None and edges >= prev:
            # no progress with the guard on — allow closures that may self-intersect
            ms.meshing_close_holes(maxholesize=100000, selfintersection=False)
        else:
            ms.meshing_close_holes(maxholesize=100000, selfintersection=(attempt == 0))
        prev = edges
    ms.apply_coord_taubin_smoothing(lambda_=0.5, mu=-0.53, stepsmoothnum=10)


def main() -> int:
    parser = argparse.ArgumentParser(description="LPS-031 mesh cleanup to watertight")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()

    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

    ms = pymeshlab.MeshSet()
    ms.load_new_mesh(str(args.input))
    before_edges, before_holes = hole_metrics(ms)
    before_faces = ms.current_mesh().face_number()

    clean_to_watertight(ms)

    after_edges, after_holes = hole_metrics(ms)
    after_faces = ms.current_mesh().face_number()
    ms.save_current_mesh(str(args.output))

    watertight = after_edges == 0 and after_holes == 0
    report = {
        "task_id": "LPS-031",
        "input": str(args.input),
        "output": str(args.output),
        "filter_script": "planning-spine-v0/worldsim/filters/watertight_cleanup.mlx",
        "boundary_edges_before": before_edges,
        "boundary_edges_after": after_edges,
        "holes_before": before_holes,
        "holes_after": after_holes,
        "watertight": watertight,
        "faces_before": before_faces,
        "faces_after": after_faces,
        "hole_fill_artifact_inspection": {
            "boundary_edges_closed": before_edges - after_edges,
            "holes_closed": before_holes - after_holes,
            "non_manifold_repair_before_hole_fill": True,
        },
    }
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if watertight else 1


if __name__ == "__main__":
    sys.exit(main())
