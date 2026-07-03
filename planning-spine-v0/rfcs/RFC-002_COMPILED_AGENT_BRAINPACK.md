# RFC-002 Compiled Agent Brainpack

## Status

`RFC` only. Not part of v0 implementation.

## Problem

v0 uses explicit roles, capabilities, decisions, and actions. A future system may need these compiled into a portable brainpack for faster loading and safer distribution.

## Proposal

A compiled brainpack would bundle:

- role manifests,
- capability manifests,
- decision templates,
- escalation rules,
- verification policies.

## Out of Scope

- autonomous self-modifying packs,
- marketplace distribution,
- dynamic company hierarchy synthesis,
- replacing the v0 JSON Schema contracts.

## Adoption Trigger

This RFC becomes relevant only after the v0 vertical slice is stable and proof-led execution is routinely working.
