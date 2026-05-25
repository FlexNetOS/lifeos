# Account-Keyed Sync — Design Sketch (NOT a Shipping Change)

**Date:** 2026-05-25
**Status:** Design-only. Tracked by `TODO.md` *"Account-keyed sync for the persistence whitelist"*; mirrors risk #8 in [`.claude/plan/cross-platform-foundation.md`](./cross-platform-foundation.md) lines 154–155. **No source modification.**

---

## 1. Problem statement

`src/lib/persistence.{ts,js}` writes the Pinia whitelist to `<app_data_dir>/ui-state.json` per OS user per machine. Sign-in is local (`src-tauri/src/auth.rs` — Argon2id PHC verifier, one record at `<app_data_dir>/account.json`, in-memory session). No shared identity across devices; no off-machine copy.

The foundation goal — *"all logins connected via distributed compute"* (foundation doc line 4) — requires keying the slice by **account**, not *machine + OS user*. A second sign-in should pull `sectionByWs`, `teamOrder`, `aiProvider`, etc. that the first device wrote. Today it starts blank. The foundation doc defers this: *"a `lifeos-core` problem, not a shell problem"* (line 155). This sketch defines the target.

## 2. Boundary preservation — auth is not sync

The Argon2id verifier gates *this device's* vault. The password is never stored, never transmitted, held in memory only across `verify_password` — `auth_signin` keeps only `email` + `display_name` in `Session` (auth.rs lines 41–47).

Sync is a **separate identity surface**: it needs a credential that authenticates to a remote vault across devices. Password-equivalent material must not leave the device.

- **Local unlock:** Argon2id PHC check against `account.json` — unchanged.
- **Sync identity:** separate credential — device-bound keypair signed at enrollment, or a short-lived bearer/JWT from a server account the user opts into. Not the password.

Sync material lives in the OS keyring (same `service: "lifeos"` namespace the AI keys use — AGENTS.md lines 161–162). `auth_reset_vault` deletes `account.json`; a sibling `sync_reset` purges keyring entries.

## 3. Three-layer model

**Layer A — local file (today).** `<app_data_dir>/ui-state.json`. First-hit cache, offline fallback, authoritative for "this device right now." The 300 ms debounced subscriber + hydrate-once read stays.

**Layer B — account vault.** Off-device, account-keyed copy. Read once at sign-in after layer A hydrates, merged via `$patch`. Writes piggyback on the existing debounce: the slice hitting `ui_state_write` also goes to a new `ui_state_sync_push` command, batched on a 5 s debounce.

**Layer C — conflicts.** Each key carries `updated_at` (ms epoch). On sign-in, for each key in `LIFEOS_PERSIST_KEYS` take the newer of (local, remote). If sides differ on >5 keys, or newest remote leads newest local by >5 minutes, surface a one-shot prompt (*LifeOS suggests: "Your other device has newer settings. Keep this view, or pull the other?"*) rather than merging silently. Last-write-wins per scalar; composites (`sectionByWs`, `teamOrder`, `sectionOrder`, `itemOrder`) are opaque per-key — workspace→section-id semantics don't tolerate partial reconciliation. CRDTs are skipped: the whitelist is small, scalar, user-driven.

## 4. Whitelist annotations (exact keys from `persistence.ts`)

Tags: **sync**, **local-only**, **derived** (none today), **transient** (already off-list).

| Key | Tag | Rationale |
| --- | --- | --- |
| `activeId` | sync | Last workspace visited. |
| `wsCollapsed` | local-only | Sidebar collapse is screen-size-driven. |
| `sectionByWs` | sync | Per-workspace last section. |
| `aiAvatarHidden` | sync | Deliberate preference. |
| `aiChatOpen` | local-only | Transient. |
| `avatarPos` | local-only | Screen-coordinate — meaningless on a different display. |
| `aiProvider` | sync | Routing follows the account; keys stay device-local. |
| `telemetryEnabled` | sync | Privacy preference is per-user. |
| `telemetryRefreshMs` | sync | Same axis. |
| `teamOrder` | sync | User-intent ordering. |
| `sectionOrder` | sync | Same. |
| `itemOrder` | sync | Same. |
| `notificationsDrawerOpen` | local-only | Transient. |
| `dismissedNotificationIds` | sync | Shouldn't re-fire elsewhere. |
| `readNotificationIds` | sync | Same. |

Net: 10 sync, 5 local. Payload is `Record<string, { value, updated_at }>` over the 10 sync-tagged keys.

## 5. Crypto-at-rest

Layer-B is encrypted client-side. The key is **not** the Argon2 verifier and **not** the password (never retained). HKDF-derived:

- During `auth_signin`, after `verify_password` succeeds and before the password drops, derive `K_sync = HKDF-SHA256(salt = account.email, ikm = Argon2id(password, distinct_salt))`. The IKM salt is distinct from the PHC verifier's, so verifier and sync key are cryptographically independent.
- `K_sync` lives in `AuthState`'s `Mutex<Option<…>>` alongside the session. Drops on `auth_signout` and `auth_reset_vault`. No disk write.
- Wire: `XChaCha20-Poly1305(plaintext = JSON, key = K_sync, nonce = random 192-bit per write)`.

Server sees only ciphertext + the routing identifier.

## 6. Storage backend — three options, deferred choice

| Option | Pros | Cons |
| --- | --- | --- |
| **Cognitum-Seed custody / witness chain** | Already on user's Pi (foundation doc lines 54–62); writes attestable; best fit for "all logins connected via distributed compute". | Pairing is deliberate (`seed_pair_clients`); blob throughput unknown; dim-8 vector store is not a blob store. |
| **WebDAV / S3, account-keyed prefix** | Simplest; `reqwest` + `rustls` wired. | No attestation; user must trust a provider. |
| **Peer-to-peer (iroh / libp2p)** | Aligned with "distributed compute"; no central server. | NAT traversal, discovery, online-when-syncing — heavy QA. |

**Decision deferred** until the Cognitum MCP client lands (foundation TODO 1d + 2).

## 7. `.ts` / `.js` sibling impact

Any change to `LIFEOS_PERSIST_KEYS`, `TauriPersistenceOptions`, or the `tauriPersistence` factory **must land in both `src/lib/persistence.ts` and `src/lib/persistence.js` simultaneously**, per the sibling-identical contract in `CLAUDE.md` and `AGENTS.md` line 88. Same for any new account-sync plugin called from `src/main.ts` — both siblings export identical surfaces until the in-browser preview is retired. The preview imports the `.js` sibling directly; drift is silent until opened.

## 8. Migration path

Existing users have layer A and no account vault. Local is the only truth until opt-in:

1. **First sign-in, original device.** No layer-B exists. Read layer A, encrypt with `K_sync`, upload as the seed.
2. **Subsequent sign-in, new device.** Layer A default; layer B exists. Decrypt, hydrate, write layer A.
3. **Subsequent sign-in, device with its own layer A.** Section 3 applies — newest-wins, prompt past threshold.
4. **Sign-out.** `K_sync` drops. Layer A stays. Layer B untouched.

No upload before sign-in. The "no account" path stays identical.

## 9. What this sketch is NOT

- Not a shipping change. Source files untouched.
- Not an API spec; wire format depends on §6.
- Not a backend choice. Cognitum integration must land first.
- Not a sync model for `aiMessages`, `extraItems`, `extraSections`, or any excluded key.
- Not multi-user. `auth.rs` still enforces one account per device; sync replicates *one user across their devices*.

## 10. Acceptance criteria for the eventual implementation

When greenlit, done when:

1. `bun run test` stays at 194/194 with no behavior change when no account is signed in — the plugin short-circuits identically to today when `K_sync` is absent.
2. `tests/store-sync.spec.js` (sibling-parity spec) stays green.
3. `bun run dev` mounts `#app` without console errors in plain Vite — OpenPencil preview preserved.
4. `bun run build` (vue-tsc + Vite) succeeds.
5. A round-trip spec verifies: sign-in on device A writes layer B; sign-in on device B reads it; `aiProvider` and `sectionByWs` reflect device A on device B; `avatarPos` and `wsCollapsed` do **not** (per §4).
6. `auth_signout` clears `K_sync` from memory (Rust unit test on `AuthState`).
7. No change to `LIFEOS_PERSIST_KEYS` ships without simultaneous edits to both `.ts` and `.js` siblings — pre-commit or CI parity gate enforces.
