# `.claude/hooks/`

Project-local Claude Code hooks for ubuntu-lifeos.

## `session-log.mjs` — auto-updated agent-session log

Registered as a `Stop` hook in `.claude/settings.json`. Every time the main Claude Code agent finishes responding, this script reads the conversation transcript and writes a markdown entry into `<repo>/SESSIONS.md`.

**Idempotent**: `Stop` fires on every assistant turn, not just at session end. The script removes the existing entry for the current `session_id` (if any) and prepends a fresh one, so each ongoing session stays represented by a single, always-current block at the top of the file.

**Scope guard**: only runs when the session's `cwd` is inside this repo. The `cwd` filter is realpath-resolved, so symlinks don't bypass it.

**Failure mode**: any error is appended to `.claude/hooks/session-log.err.log` and the process exits 0. The other three global `Stop` hooks (ruvector, stop-notify, memory-coach) are never blocked.

**Hard 2.5s timeout** baked into the script itself, in addition to the 3s declared in `settings.json`.

### Entry schema

```
## <ISO-8601 UTC> · `<short session id>` · <duration>

**Branch**: <branch> · **HEAD**: `<short SHA>`
**Prompt**: "<first user prompt, ≤240 chars>"

**Tools**: <tool name>×<count> · …   (MCP tools collapse to "MCP")
**Files touched**: `<rel path>`, …
**Subagents**: `<subagent_type>` — "<description>"; …

**Outcome**: <last assistant text, ≤480 chars>

---
```

Slash-command wrappers (`<command-message>`, `<command-name>`, `<command-args>`) are stripped from the captured prompt for readability.

### Disable

Remove the `Stop` block from `.claude/settings.json`, or delete `.claude/hooks/session-log.mjs`. The hook self-protects: if either is absent, nothing runs.

### Force a manual entry

```bash
echo '{"session_id":"manual-test","cwd":"/home/drdave/repos/ubuntu-lifeos","transcript_path":"<path-to-jsonl>"}' \
  | node /home/drdave/repos/ubuntu-lifeos/.claude/hooks/session-log.mjs
```
