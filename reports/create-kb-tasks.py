#!/usr/bin/env python3
"""Create the blueprint task stream in the meta-root KB: create, checkout,
materialize each draft body into the workspace. Commit is done separately
(scoped pathspecs) after a status review."""
import json, re, subprocess, sys
from pathlib import Path

KB = Path("/home/flexnetos/meta")
WS = KB / ".kb/workspaces/main"
DRAFTS = sorted(Path("/home/flexnetos/meta/src/lifeos/reports/task-drafts").glob("*.md"))

def run(*args):
    return subprocess.run(args, cwd=KB, capture_output=True, text=True)

created, failed = [], []
for draft in DRAFTS:
    text = draft.read_text()
    slug = re.search(r"^slug: (\S+)", text, re.M).group(1)
    title = re.search(r'^title: "(.+)"', text, re.M).group(1)
    r = run("git-kb", "create", "--type", "task", "--slug", slug, "--title", title, "--json")
    if r.returncode != 0 and "exists" not in (r.stderr + r.stdout).lower():
        failed.append((slug, "create", (r.stderr or r.stdout).strip()[:200]))
        continue
    r = run("git-kb", "checkout", slug)
    if r.returncode != 0:
        failed.append((slug, "checkout", (r.stderr or r.stdout).strip()[:200]))
        continue
    target = WS / f"{slug}.md"
    if not target.parent.is_dir():
        failed.append((slug, "workspace-path", f"{target.parent} missing"))
        continue
    target.write_text(text)
    created.append(slug)

print(json.dumps({"created": created, "failed": failed}, indent=1))
sys.exit(1 if failed else 0)
