from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = (
    Path(__file__).parent
    / "envctl-db-nu-plugin-migration-automation-package"
    / "execution-framework"
    / "scripts"
)
sys.path.insert(0, str(SCRIPT_DIR))
SPEC = importlib.util.spec_from_file_location(
    "task_graph_to_packets",
    SCRIPT_DIR / "task_graph_to_packets.py",
    submodule_search_locations=[str(SCRIPT_DIR)],
)
assert SPEC is not None and SPEC.loader is not None
task_graph_to_packets = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(task_graph_to_packets)


class TaskGraphToPacketsTests(unittest.TestCase):
    def test_identical_packet_preserves_generated_at(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "TASK-001.json"
            output.write_text(
                json.dumps(
                    {
                        "packet_schema_version": "1.0",
                        "task_id": "TASK-001",
                        "generated_at": "2026-07-27T00:00:00+00:00",
                    }
                ),
                encoding="utf-8",
            )
            packet = {
                "packet_schema_version": "1.0",
                "task_id": "TASK-001",
                "generated_at": "2026-07-27T01:00:00+00:00",
            }

            before = output.read_bytes()
            written = task_graph_to_packets.write_packet(output, packet)

            self.assertFalse(written)
            self.assertEqual(packet["generated_at"], "2026-07-27T00:00:00+00:00")
            self.assertEqual(output.read_bytes(), before)

    def test_changed_packet_keeps_new_generated_at(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "TASK-001.json"
            output.write_text(
                json.dumps(
                    {
                        "packet_schema_version": "1.0",
                        "task_id": "TASK-001",
                        "command_template": "old",
                        "generated_at": "2026-07-27T00:00:00+00:00",
                    }
                ),
                encoding="utf-8",
            )
            packet = {
                "packet_schema_version": "1.0",
                "task_id": "TASK-001",
                "command_template": "new",
                "generated_at": "2026-07-27T01:00:00+00:00",
            }

            written = task_graph_to_packets.write_packet(output, packet)

            self.assertTrue(written)
            self.assertEqual(
                json.loads(output.read_text(encoding="utf-8"))["generated_at"],
                "2026-07-27T01:00:00+00:00",
            )

    def test_non_object_packet_is_replaced(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "TASK-001.json"
            output.write_text("[]\n", encoding="utf-8")
            packet = {
                "packet_schema_version": "1.0",
                "task_id": "TASK-001",
                "generated_at": "2026-07-27T01:00:00+00:00",
            }

            written = task_graph_to_packets.write_packet(output, packet)

            self.assertTrue(written)
            self.assertEqual(
                json.loads(output.read_text(encoding="utf-8"))["task_id"],
                "TASK-001",
            )

    def test_invalid_utf8_packet_is_replaced(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "TASK-001.json"
            output.write_bytes(b"\xff")
            packet = {
                "packet_schema_version": "1.0",
                "task_id": "TASK-001",
                "generated_at": "2026-07-27T01:00:00+00:00",
            }

            written = task_graph_to_packets.write_packet(output, packet)

            self.assertTrue(written)
            self.assertEqual(
                json.loads(output.read_text(encoding="utf-8"))["task_id"],
                "TASK-001",
            )


if __name__ == "__main__":
    unittest.main()
