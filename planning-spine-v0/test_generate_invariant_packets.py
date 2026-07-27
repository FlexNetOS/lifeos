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


if __name__ == "__main__":
    unittest.main()
