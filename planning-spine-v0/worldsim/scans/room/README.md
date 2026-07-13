# Room scan drop-zone

Drop the physical LiDAR room scan here — a Polycam high-density `.ply`
export — then run the LPS-029 ingest inside the worldsim Nix shell:

```bash
nix develop path:planning-spine-v0/worldsim -c \
    python3 planning-spine-v0/worldsim/scripts/ingest_room_scan.py
```

The ingest runner globs `*.ply` from this directory, drives the verified
cleanup → USD → base-layer → acceptance pipeline, and composites the room
with the manufacturer-spec workstation twin to close LPS-029.
