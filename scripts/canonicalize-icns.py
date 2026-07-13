#!/usr/bin/env python3
"""Canonicalize ICNS chunk order without changing icon payload bytes."""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path


class IcnsError(ValueError):
    pass


def canonicalize(data: bytes) -> bytes:
    if len(data) < 8 or data[:4] != b"icns":
        raise IcnsError("file is not an ICNS container")
    declared_size = struct.unpack(">I", data[4:8])[0]
    if declared_size != len(data):
        raise IcnsError(f"declared size {declared_size} does not match {len(data)} bytes")

    chunks: list[tuple[bytes, bytes]] = []
    seen_types: set[bytes] = set()
    offset = 8
    while offset < len(data):
        if offset + 8 > len(data):
            raise IcnsError(f"truncated chunk header at byte {offset}")
        chunk_type = data[offset : offset + 4]
        chunk_size = struct.unpack(">I", data[offset + 4 : offset + 8])[0]
        if chunk_size < 8 or offset + chunk_size > len(data):
            raise IcnsError(f"invalid {chunk_type!r} chunk size {chunk_size}")
        if chunk_type in seen_types:
            raise IcnsError(f"duplicate ICNS chunk type {chunk_type!r}")
        seen_types.add(chunk_type)
        chunks.append((chunk_type, data[offset : offset + chunk_size]))
        offset += chunk_size

    body = b"".join(chunk for _chunk_type, chunk in sorted(chunks))
    return b"icns" + struct.pack(">I", len(body) + 8) + body


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="ICNS file produced by the Tauri CLI")
    parser.add_argument("--check", action="store_true", help="fail unless the file is already canonical")
    args = parser.parse_args()

    try:
        original = args.path.read_bytes()
        canonical = canonicalize(original)
    except (OSError, IcnsError) as error:
        print(f"canonicalize-icns: error: {error}", file=sys.stderr)
        return 1

    if args.check:
        if original != canonical:
            print(f"canonicalize-icns: non-canonical chunk order: {args.path}", file=sys.stderr)
            return 1
        print(f"canonicalize-icns: canonical: {args.path}")
        return 0

    if original != canonical:
        args.path.write_bytes(canonical)
        print(f"canonicalize-icns: reordered chunks: {args.path}")
    else:
        print(f"canonicalize-icns: already canonical: {args.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
