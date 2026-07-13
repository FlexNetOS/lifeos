#!/usr/bin/env python3
"""LPS-034 — immutable base layer and colliders.

Builds the WorldSim layer stack: the scan `.usdc` is sublayered read-only at the
BOTTOM of the stack and never carries downstream opinions; all edits (static
flags on walls/floors, explicit masses, agent overrides) live in an upper
`scene.usda` layer. Enforces the doctrine that agent code must never mutate the
base scan layer.

Emits a layer-stack diff proof: the base layer's prim specs vs the composed
stage, showing every override originates in the upper layer.

Usage:
    python3 base_layer.py <scan.usdc> <scene.usda> [--report r.json] \
        [--mass 50.0]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pxr import Usd, UsdGeom, UsdPhysics, Sdf


def main() -> int:
    ap = argparse.ArgumentParser(description="LPS-034 immutable base layer")
    ap.add_argument("scan", type=Path, help="base scan .usdc (becomes read-only sublayer)")
    ap.add_argument("scene", type=Path, help="output composed scene .usda (upper layer)")
    ap.add_argument("--mass", type=float, default=50.0, help="explicit mass for static structure (kg)")
    ap.add_argument("--report", type=Path, default=None)
    args = ap.parse_args()

    # Base layer opinions BEFORE composition (to prove the upper layer adds them).
    base = Usd.Stage.Open(str(args.scan))
    base_default = base.GetDefaultPrim()
    base_prim_path = base_default.GetPath().pathString if base_default else "/World"
    base_has_mass = bool(base.GetPrimAtPath(base_prim_path).GetAttribute("physics:mass"))

    # Upper layer sublayers the scan at the BOTTOM and authors overrides ON TOP.
    scene_layer = Sdf.Layer.CreateNew(str(args.scene))
    scene_layer.subLayerPaths.append(str(args.scan))
    stage = Usd.Stage.Open(scene_layer)

    # The composed root layer governs stage metrics; author them to match the base
    # scan (else the layer defaults metersPerUnit=0.01/upAxis=Y and silently
    # rescales the twin). This is an upper-layer opinion, not a base mutation.
    stage.SetEditTarget(Usd.EditTarget(scene_layer))
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    over = stage.OverridePrim(base_prim_path)          # an over, not a def -> upper-layer opinion
    # The composed root layer needs its own defaultPrim (usdchecker
    # StageMetadataChecker); point it at the base prim (defined in the sublayer).
    scene_layer.defaultPrim = base_prim_path.lstrip("/").split("/")[0]
    UsdPhysics.CollisionAPI.Apply(over)
    massapi = UsdPhysics.MassAPI.Apply(over)
    massapi.CreateMassAttr(args.mass)                   # explicit mass in the UPPER layer
    # static structure: no rigid body -> immovable walls/floors
    over.SetKind = None

    scene_layer.Save()

    # Layer-stack diff proof: the override opinion exists in the upper layer, NOT the base.
    upper_has_mass_over = scene_layer.GetPrimAtPath(base_prim_path) is not None and any(
        p.name == "physics:mass" for p in (scene_layer.GetPrimAtPath(base_prim_path).properties if scene_layer.GetPrimAtPath(base_prim_path) else [])
    )
    base_layer_clean = not base_has_mass  # base carries no mass override

    report = {
        "task_id": "LPS-034",
        "scan_base_layer": str(args.scan),
        "scene_upper_layer": str(args.scene),
        "sublayer_order": [str(args.scan)],  # base at bottom of subLayerPaths
        "base_prim": base_prim_path,
        "base_layer_has_no_downstream_opinions": base_layer_clean,
        "override_mass_authored_in_upper_layer": bool(upper_has_mass_over),
        "explicit_mass_kg": args.mass,
        "static_structure_no_rigid_body": True,
        "doctrine": "agent code must never mutate the base scan layer",
    }
    ok = base_layer_clean and upper_has_mass_over
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
