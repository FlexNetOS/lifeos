#!/usr/bin/env python3
import json
import tempfile
import unittest
from pathlib import Path

from helpers.package_manifest import build_manifest, check_manifest, write_manifest


class PackageManifestTests(unittest.TestCase):
    def test_excludes_only_the_root_manifest_and_keeps_nested_manifests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "PACKAGE_MANIFEST.json").write_text("{}\n", encoding="utf-8")
            (root / "README.md").write_text("root\n", encoding="utf-8")
            nested = root / "source" / "fixture"
            nested.mkdir(parents=True)
            (nested / "PACKAGE_MANIFEST.json").write_text("{\"nested\": true}\n", encoding="utf-8")
            cache = root / "helpers" / "__pycache__"
            cache.mkdir(parents=True)
            (cache / "package_manifest.pyc").write_bytes(b"runtime cache")

            manifest = build_manifest(root)

            self.assertEqual(manifest["file_count"], 2)
            self.assertEqual(
                [entry["path"] for entry in manifest["files"]],
                ["README.md", "source/fixture/PACKAGE_MANIFEST.json"],
            )

    def test_write_and_check_detect_content_and_membership_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "README.md").write_text("first\n", encoding="utf-8")

            write_manifest(root)
            self.assertEqual(check_manifest(root), [])

            (root / "README.md").write_text("changed\n", encoding="utf-8")
            errors = check_manifest(root)
            self.assertTrue(any("hash_or_size_drift" in error for error in errors))

            write_manifest(root)
            (root / "new.txt").write_text("new\n", encoding="utf-8")
            errors = check_manifest(root)
            self.assertTrue(any("unlisted_file" in error for error in errors))

    def test_duplicate_entries_and_declared_count_drift_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "README.md").write_text("root\n", encoding="utf-8")
            write_manifest(root)
            manifest_path = root / "PACKAGE_MANIFEST.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["file_count"] = 2
            manifest["files"].append(dict(manifest["files"][0]))
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            errors = check_manifest(root)

            self.assertTrue(any("duplicate_path" in error for error in errors))
            self.assertTrue(any("declared_file_count" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
