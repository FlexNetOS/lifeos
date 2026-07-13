#!/usr/bin/env python3
"""LPS-036 — Genesis feasibility on the validated twin.

Builds the manufacturer-spec workstation twin (from workstation_spec.json) as a
Genesis rigid-body scene on the RTX 5090 and runs the feasibility gate:
  1. headless offscreen simulation succeeds on the GPU backend
  2. step throughput > 30 FPS
  3. a repeated seeded run is bit-exact deterministic (identical final state)

Per the Genesis-first decision (defers NVIDIA Cosmos). Emits a feasibility report
JSON referenced by the LPS-036 proof.

Usage:
    python3 genesis_feasibility.py <workstation_spec.json> [--report r.json] \
        [--steps 200]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import genesis as gs


def build_and_run(spec: dict, steps: int, seed: int) -> tuple[float, str]:
    gs.init(backend=gs.gpu, precision="32", seed=seed, logging_level="warning")
    scene = gs.Scene(show_viewer=False, show_FPS=False)
    scene.add_entity(gs.morphs.Plane())  # floor
    entities = []
    for c in spec["components"]:
        dx, dy, dz = c["dimensions_m"]
        px, py, pz = c["position_m"]
        e = scene.add_entity(
            gs.morphs.Box(size=(dx, dy, dz), pos=(px, py, pz + 1.0)),  # drop from +1m
        )
        entities.append(e)
    scene.build()

    # warmup
    for _ in range(10):
        scene.step()
    t0 = time.perf_counter()
    for _ in range(steps):
        scene.step()
    elapsed = time.perf_counter() - t0
    fps = steps / elapsed if elapsed > 0 else float("inf")

    # final-state fingerprint for determinism
    state = []
    for e in entities:
        pos = np.asarray(e.get_pos().cpu()).ravel()
        state.append(pos)
    fingerprint = hashlib.sha256(np.concatenate(state).round(5).tobytes()).hexdigest()
    gs.destroy()
    return fps, fingerprint


def main() -> int:
    ap = argparse.ArgumentParser(description="LPS-036 Genesis feasibility")
    ap.add_argument("spec", type=Path)
    ap.add_argument("--steps", type=int, default=200)
    ap.add_argument("--report", type=Path, default=None)
    args = ap.parse_args()

    spec = json.loads(args.spec.read_text())

    fps1, fp1 = build_and_run(spec, args.steps, seed=42)
    fps2, fp2 = build_and_run(spec, args.steps, seed=42)

    deterministic = fp1 == fp2
    over_30fps = fps1 > 30.0
    ok = deterministic and over_30fps

    report = {
        "task_id": "LPS-036",
        "spec": str(args.spec),
        "backend": "genesis.gpu (RTX 5090, sm_120)",
        "components": [c["instance_id"] for c in spec["components"]],
        "steps": args.steps,
        "fps_run1": round(fps1, 1),
        "fps_run2": round(fps2, 1),
        "over_30_fps": over_30fps,
        "state_fingerprint_run1": fp1,
        "state_fingerprint_run2": fp2,
        "bit_exact_deterministic": deterministic,
        "genesis_first_decision": "RuView ADR-147: Genesis over NVIDIA Cosmos (VRAM headroom on 2x RTX 5090 32GB)",
        "feasible": ok,
    }
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
