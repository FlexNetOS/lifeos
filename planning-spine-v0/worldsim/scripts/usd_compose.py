#!/usr/bin/env python3
"""LPS-033 — OpenUSD composition with physics schemas.

Converts a repaired (watertight) mesh into a `.usdc` stage authored with
UsdGeom + UsdPhysics schemas per the worldsim doctrine:
  - metersPerUnit = 1.0
  - upAxis = Z
  - per-vertex normals in OpenGL (right-handed) orientation
  - a metallic PBR UsdPreviewSurface material
  - UsdPhysics collision (+ optional rigid body) on the geometry

Verifies the authored stage with `usdchecker` (must exit 0, zero errors).
Runs under the worldsim Nix dev shell (pxr + usdchecker on PATH).

Usage:
    python3 usd_compose.py <input_mesh.ply|obj> <output.usdc> [--report r.json] \
        [--prim /World/Room] [--static]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import pymeshlab
from pxr import Usd, UsdGeom, UsdPhysics, UsdShade, Gf, Sdf, Vt


def load_mesh(path: Path):
    ms = pymeshlab.MeshSet()
    ms.load_new_mesh(str(path))
    ms.compute_normal_per_vertex()
    m = ms.current_mesh()
    verts = m.vertex_matrix()          # (N,3)
    faces = m.face_matrix()            # (M,3)
    normals = m.vertex_normal_matrix() # (N,3)
    return verts, faces, normals


def author_stage(verts, faces, normals, out: Path, prim_path: str, static: bool) -> None:
    stage = Usd.Stage.CreateNew(str(out))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)          # upAxis = Z
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)               # metersPerUnit = 1.0

    world = UsdGeom.Xform.Define(stage, "/World")
    stage.SetDefaultPrim(world.GetPrim())
    mesh = UsdGeom.Mesh.Define(stage, prim_path)

    mesh.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(*map(float, v)) for v in verts]))
    mesh.CreateFaceVertexCountsAttr(Vt.IntArray([3] * len(faces)))
    mesh.CreateFaceVertexIndicesAttr(Vt.IntArray([int(i) for f in faces for i in f]))
    # OpenGL / right-handed normals + orientation
    n = mesh.CreateNormalsAttr(Vt.Vec3fArray([Gf.Vec3f(*map(float, vn)) for vn in normals]))
    mesh.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
    mesh.CreateOrientationAttr(UsdGeom.Tokens.rightHanded)
    mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)

    # Metallic PBR material (UsdPreviewSurface)
    mat = UsdShade.Material.Define(stage, prim_path + "/Mat")
    shader = UsdShade.Shader.Define(stage, prim_path + "/Mat/PBR")
    shader.CreateIdAttr("UsdPreviewSurface")
    shader.CreateInput("metallic", Sdf.ValueTypeNames.Float).Set(1.0)
    shader.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.5)
    shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.5, 0.5, 0.55))
    mat.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), "surface")
    binding = UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim())
    binding.Bind(mat)

    # UsdPhysics: collision always; rigid body only for movable instances
    UsdPhysics.CollisionAPI.Apply(mesh.GetPrim())
    if not static:
        UsdPhysics.RigidBodyAPI.Apply(mesh.GetPrim())
    else:
        # static structure carries mass metadata via the collision prim only
        UsdPhysics.MassAPI.Apply(mesh.GetPrim())
    stage.GetRootLayer().Save()


def usdchecker(path: Path) -> tuple[int, str]:
    proc = subprocess.run(["usdchecker", str(path)], capture_output=True, text=True)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description="LPS-033 OpenUSD composition")
    ap.add_argument("input", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--prim", default="/World/Geometry")
    ap.add_argument("--static", action="store_true", help="author as static structure (walls/floors)")
    ap.add_argument("--report", type=Path, default=None)
    args = ap.parse_args()

    verts, faces, normals = load_mesh(args.input)
    author_stage(verts, faces, normals, args.output, args.prim, args.static)
    rc, out = usdchecker(args.output)

    report = {
        "task_id": "LPS-033",
        "input": str(args.input),
        "output": str(args.output),
        "meters_per_unit": 1.0,
        "up_axis": "Z",
        "normals": "per-vertex, rightHanded (OpenGL)",
        "material": "UsdPreviewSurface metallic=1.0",
        "physics": "UsdPhysics.CollisionAPI" + ("" if args.static else " + RigidBodyAPI"),
        "usdchecker_returncode": rc,
        "usdchecker_output": out,
        "verts": int(len(verts)),
        "faces": int(len(faces)),
    }
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if rc == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
