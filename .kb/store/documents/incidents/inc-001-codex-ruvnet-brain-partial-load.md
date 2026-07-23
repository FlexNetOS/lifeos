---
id: 019f9063-1da9-73b1-a833-e9ced4246e21
slug: incidents/inc-001-codex-ruvnet-brain-partial-load
title: "Codex Loads Only Part of ruvnet-brain"
type: incident
status: draft
priority: high
tags: [codex, plugin, ruvnet-brain, hooks, mcp, dx]
---

## Overview

On 2026-07-23, Codex's profile-owned plugin runtime exposed the cached ruvnet-brain skill files but did not expose the plugin's source-grounded `search_ruvnet` MCP tool. The live startup also reported that it failed to parse the ruvnet-brain hooks configuration at `/run/user/1001/yazelix/profile-runtime/codex/plugins/cache/gitkb/ruvnet-brain/3.9.18-dev/hooks`. This is the third installation attempt requested by the owner; the required outcome is a complete, clean Codex installation rather than a skills-only cache.

## Symptoms

- Startup warning: `failed to parse plugin hooks config /run/user/1001/yazelix/profile-runtime/codex/plugins/cache/gitkb/ruvnet-brain/3.9.18-dev/hooks`
- The cached `ruvnet-brain`, `brain-build`, `brain-prompt`, `brain-score`, and `savings` skills are discoverable.
- A clean Codex tool-registry search does not return `search_ruvnet`, so the MCP server is not live.
- The plugin cache is nested under the profile-owned Codex runtime and must remain compliant with the single-profile path law.

## Impact

Codex cannot use the plugin's authoritative RuvNet corpus even though skill text is visible, so capability grounding and the requested complete skill/tool surface are unavailable. The installation is materially incomplete.

## Investigation

The first clean probe confirmed this is a partial-load state, not an absent cache. Investigation will compare the installed manifest, hook layout, MCP declaration, package source, Codex parser contract, and profile-owned plugin registry. Shared configuration will not be changed until the failure is reproduced and isolated to the exact installation/configuration cause.

## Resolution Criteria

- The profile-owned Codex runtime contains the intended ruvnet-brain release from an authoritative source.
- Codex starts without the ruvnet-brain hook parse warning.
- All shipped ruvnet-brain skills are discoverable.
- The `search_ruvnet` MCP tool is discoverable and returns a source-grounded result.
- Any shipped executable/tool entrypoints required by the plugin pass direct smoke checks.
- A clean-process validation proves the result rather than relying on the current process's preloaded registry.

## Related

- [[tasks/blueprint-ingest-envctl-component-014]] — shares the profile/XDG/envctl ownership boundary but is not a duplicate of this plugin incident.