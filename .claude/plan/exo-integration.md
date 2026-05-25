# Exo Integration Plan — LifeOS Desktop Fleet

**Date:** 2026-05-25
**Status:** Planning only. No source modification. No Exo installation.
**Scope:** Workstation (Linux) + macOS/Linux laptops on the same LAN.

---

## What Exo Is

Exo (`exo-explore/exo`) is a Python-first distributed AI inference runtime that shards models
peer-to-peer across heterogeneous personal devices. It discovers peers automatically and exposes
an OpenAI-compatible HTTP API on each node. No training; inference only.
*(Source: `.claude/plan/cross-platform-foundation.md`, verified against `github.com/exo-explore/exo` README.)*

---

## Out of Scope

iOS, Android, ESP32, Pi Zero, and Pi 3 are **explicitly excluded** from this plan. Exo targets
macOS (primary, Tahoe 26.2+ dedicated app) and Linux (CPU-only; GPU WIP). Mobile and
microcontrollers are not in the project's scope for Exo participation.
*(Source: `.claude/plan/cross-platform-foundation.md` lines 47–52.)*

---

## Process Model

Exo runs as a **separate Python process** on each desktop node. LifeOS does not embed Exo
in-process and does not manage its lifecycle. The Exo daemon is started, stopped, and updated
independently of LifeOS — users manage it via the Exo CLI or macOS app.

LifeOS communicates with the local Exo daemon over **HTTP on `localhost:52415`** (Exo's default
port, verified against README). On macOS and Linux this is a plain loopback TCP connection; no
UNIX socket is exposed by default. The `call_exo` function that implements this lives in
`src-tauri/src/lib.rs` (or its future `lifeos-core::mcp` equivalent once TODO 1d lands — that is
the preferred home).

---

## Network Topology

```
LAN
┌─────────────────────────────────────────────────────────────┐
│  Workstation (Linux)          macOS Laptop    Linux Laptop  │
│  Exo daemon  ←──── libp2p / mDNS auto-discovery ────→ Exo  │
│  :52415                                             :52415   │
│     ↑                                                        │
│  LifeOS Tauri                                               │
│  ai_complete("exo") → HTTP GET/POST localhost:52415          │
└─────────────────────────────────────────────────────────────┘
```

**Assumptions (mark where unverified):**

| Assumption | Status |
|---|---|
| Exo default HTTP port is `52415` | Verified — README |
| Peer discovery is libp2p-based; no manual config required | Verified — README |
| `EXO_LIBP2P_NAMESPACE` isolates clusters on shared networks | Verified — README |
| mDNS is the primary LAN discovery transport | Likely — consistent with libp2p defaults; **unverified — confirm against `github.com/exo-explore/exo` before implementing** |
| LAN port range beyond 52415 (inter-node sharding traffic) | **Unverified — confirm before opening firewall rules** |
| Pi 4/5 Linux can join as CPU-only worker | **Unverified** per foundation doc |

---

## API Surface LifeOS Needs from Exo

All three endpoints are on the same base URL (`http://<exo_endpoint>`). Verified against
`github.com/exo-explore/exo` README:

| Operation | Method | Path | Notes |
|---|---|---|---|
| List available models | GET | `/models` | Filter `?status=downloaded` for loaded models |
| Chat completion (blocking) | POST | `/v1/chat/completions` | OpenAI-compatible body |
| Chat completion (streaming) | POST | `/v1/chat/completions` | Same endpoint; `"stream": true` in body |

Request body for chat completion matches the OpenAI `v1/chat/completions` schema exactly — same
`model`, `messages`, `stream` fields the existing `call_openai` function already constructs.
Exo also exposes `/v1/messages` (Claude format) and `/ollama/api/chat` if preferred.

Authentication: **none documented**. The endpoint is unauthenticated by default. See Security
section below.

---

## Where This Hooks Into LifeOS

Add `exo` as a fourth provider alongside `claude`, `openai`, `gemini` in
`src-tauri/src/lib.rs`:

```rust
const SUPPORTED_PROVIDERS: &[&str] = &["claude", "openai", "gemini", "exo"];
```

Add `call_exo` following the same signature as `call_openai`. The only structural difference is
that no keyring lookup is needed — `exo_endpoint` is read from `ai.json` instead of a secret.

Configuration schema (`<app_data_dir>/ai.json`):

```json
{ "provider": "exo", "exo_endpoint": "http://10.0.0.5:52415", "exo_model": "llama-3.2-3b" }
```

`exo_endpoint` defaults to `http://localhost:52415` when the key is absent (local daemon on the
same machine). `exo_model` defaults to whatever Exo's `/models?status=downloaded` returns first.
The `read_provider` function already guards unknown providers against `SUPPORTED_PROVIDERS`, so
adding `"exo"` there is the only change to that path.

---

## Authentication and Trust

Exo binds to all interfaces by default on some configurations — **unverified, confirm against
Exo docs before deploying on a multi-user network**. Recommended posture:

- **Single-machine use (local daemon):** bind Exo to `127.0.0.1` only. No exposure needed.
- **Cross-host LAN fleet:** route LifeOS → remote Exo through an **SSH tunnel** or **Tailscale**
  rather than opening port 52415 on the LAN. The `exo_endpoint` in `ai.json` then points to the
  tunnel's local port (e.g., `http://127.0.0.1:52415` via `ssh -L 52415:localhost:52415 laptop`).
- Do **not** open Exo's port directly to untrusted LAN segments. Exo has no auth layer.

---

## Failure Modes

All failures use `AI_ERROR_MSG` (the calm string already defined at line 99 of `lib.rs`), plus an
internal `eprintln!` log not exposed to the UI.

| Failure | Calm UI string | Internal log |
|---|---|---|
| Exo daemon offline / connection refused | `AI_ERROR_MSG` | `"exo: connection refused at {endpoint}"` |
| Model not loaded (empty `/models?status=downloaded`) | `AI_ERROR_MSG` | `"exo: no downloaded model found"` |
| Cold model load — first-token latency timeout | `AI_ERROR_MSG` | `"exo: request timed out (cold load?)"` |
| HTTP non-2xx from Exo | `AI_ERROR_MSG` | `"exo: HTTP {status}"` |

Set a generous first-response timeout (recommend 90s) to tolerate cold model loads. The existing
`reqwest::Client` already handles this via `.timeout(Duration::from_secs(90))`.

---

## What Is Explicitly NOT in This Plan

- Training or fine-tuning of any model.
- Mobile (iOS, Android) Exo participation.
- ESP32, Pi Zero, Pi 3 Exo participation.
- Auto-installation or lifecycle management of Exo from LifeOS.
- Any change to `Cargo.toml`, Vue source, or Pinia stores in this planning phase.
- Settings UI for the endpoint URL (deferred to step (b) below).

---

## Recommended Next Steps

**(a) Wait for `lifeos-core::mcp` stubs (TODO 1d) before adding `call_exo`.** The natural home
for Exo RPC is `lifeos-core::mcp`, not inline in `src-tauri/src/lib.rs`. Once 1d lands, add
`call_exo` there and expose it through a thin Tauri command wrapper — the same pattern as the
planned Cognitum and RuVector clients. This keeps the Tauri shell as thin glue and keeps Exo
callable from any future shell (headless Pi daemon, mobile). **(b)** Add a Settings UI section
for the Exo endpoint URL and model name when (a) is in place — reuse the existing
`/settings/:section?` route and `ai.json` read/write commands already wired in `lib.rs`.
**(c)** Document the SSH-tunnel pattern for cross-host use in `docs/exo-fleet-setup.md` once
the first user attempts a multi-machine config.
