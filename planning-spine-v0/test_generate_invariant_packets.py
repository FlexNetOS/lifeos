from __future__ import annotations

import importlib.util
import shlex
import unittest
from pathlib import Path


SCRIPT = (
    Path(__file__).parent
    / "envctl-db-nu-plugin-migration-automation-package"
    / "execution-framework"
    / "scripts"
    / "generate_invariant_packets.py"
)
SPEC = importlib.util.spec_from_file_location("generate_invariant_packets", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
generate_invariant_packets = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generate_invariant_packets)


class GenerateInvariantPacketsTests(unittest.TestCase):
    def test_psql_assignments_are_explicit_shell_commands(self) -> None:
        checked = 0
        for probe in generate_invariant_packets.PROBES.values():
            for field in ("probe", "verify"):
                command = str(probe[field])
                if "PSQL=" not in command:
                    continue
                checked += 1
                self.assertEqual(shlex.split(command)[0:2], ["bash", "-lc"])

        self.assertEqual(checked, 11)

    def test_partial_invariant_checks_never_claim_full_implementation(self) -> None:
        for number in range(1, 20):
            packet = generate_invariant_packets.build_packet(
                {
                    "number": number,
                    "text": f"Invariant {number}",
                    "anchor_offset": number,
                    "anchor_sha256": f"sha-{number}",
                },
                "anchor-sha",
                "2026-07-27T00:00:00+00:00",
            )
            self.assertTrue(packet["needs_capability_probe"])
            self.assertIn(
                packet["probe_class"],
                {"partial-capability-probe", "drift-canary"},
            )
            self.assertIn(
                "NOT evidence of implementation",
                packet["completion_gate"],
            )


if __name__ == "__main__":
    unittest.main()
