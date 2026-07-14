#!/usr/bin/env python3
"""Extract raw task graph rows from a CSV export.

The raw artifact intentionally preserves every source column as text. Later
pipeline stages own normalization, typing, and schema enforcement.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from reproducible_time import utc_now


SCHEMA_VERSION = "lifeos-planning-spine.task-graph.raw.v0"


def fail(message: str) -> None:
    print(f"extract-task-graph: error: {message}", file=sys.stderr)
    raise SystemExit(1)


def read_csv(source_path: Path) -> dict:
    if not source_path.exists():
        fail(f"source CSV does not exist: {source_path}")
    if not source_path.is_file():
        fail(f"source CSV is not a file: {source_path}")

    rows = []
    empty_rows_skipped = []

    with source_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            fail("source CSV is empty")

        if not header or all(not cell.strip() for cell in header):
            fail("source CSV is missing a header row")

        normalized_header = [cell.strip() for cell in header]
        blank_header_indexes = [index + 1 for index, cell in enumerate(normalized_header) if not cell]
        if blank_header_indexes:
            fail(f"header contains blank column name(s) at position(s): {blank_header_indexes}")

        duplicate_headers = sorted(
            {name for name in normalized_header if normalized_header.count(name) > 1}
        )
        if duplicate_headers:
            fail(f"header contains duplicate column name(s): {', '.join(duplicate_headers)}")

        for source_row_number, row in enumerate(reader, start=2):
            if not row or all(not cell.strip() for cell in row):
                empty_rows_skipped.append(source_row_number)
                continue

            if len(row) != len(normalized_header):
                fail(
                    "row "
                    f"{source_row_number} has {len(row)} column(s); "
                    f"expected {len(normalized_header)}"
                )

            rows.append(
                {
                    "source_row_number": source_row_number,
                    "columns": dict(zip(normalized_header, row, strict=True)),
                }
            )

    if not rows:
        fail("source CSV has no task graph rows after the header")

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": utc_now(),
        "source": {
            "format": "csv",
            "path": str(source_path),
            "header": normalized_header,
            "row_count": len(rows),
            "empty_rows_skipped": empty_rows_skipped,
        },
        "rows": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract raw task graph rows from a CSV export into JSON."
    )
    parser.add_argument("source_csv", type=Path, help="CSV export to extract")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("generated/task_graph.raw.json"),
        help="Output JSON path",
    )
    args = parser.parse_args()

    artifact = read_csv(args.source_csv)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")

    print(
        "extract-task-graph: wrote "
        f"{args.output} with {artifact['source']['row_count']} row(s); "
        f"skipped empty rows: {artifact['source']['empty_rows_skipped']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
