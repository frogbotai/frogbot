# Pieces & Connections — Architecture Decisions

## Scope

Resolves the blocking questions from `batch_plan.md`: placement (core vs plugin), the connections collection, the fate of `plugin-oauth` and `plugin-api-keys`, and tool granularity. Decisions here are the base for Batch 0.

## Facts This Rests On

- Frogbot has an established **core-collection idiom**: chat threads/messages. Role marker on a user collection (`thread: true`), default injected when absent, slug collision is a hard error with a "adopt or rename" message, base fields appended, same-name merges are user-wins per key except `type` is locked (throws), reserved field names throw at build (`chat/resolveChatCollections.ts`, `chat/mergeCollection.ts`).
- Frogbot has an established **plugin-collection idiom**: defaults + `existing` user collection + `options.collection` override, last-wins field merge with no protection (`plugin-api-keys/src/collection.ts`, `plugin-oauth/src/collections/shared.js`).
- `plugin-oauth` is implemented and already contains the two primitives a core connections layer needs: a connections collection (owner, provider, encrypted tokens, scopes, status, metadata) and a versioned AES-256-GCM utility with pluggable KMS-style override (`server/crypto.ts`, `v1.<iv>.<tag>.<ciphertext>`).
- `plugin-api-keys` stores **SHA-256 hashes**. Plaintext is shown once at mint and is unrecoverable. It is an *inbound* auth strategy (authenticate callers to Frogbot), not credential storage.
- Agents reference tools inline: `AgentConfig.tools: readonly AnyTool[]`, no global registry; tool = `{ slug, description, inputSchema, execute(input, ToolCtx) }`.

## Decision 1 — Inbound vs Outbound Credentials Are Different Things

`plugin-api-keys` = inbound (who may call Frogbot). Connections = outbound (what Frogbot may call on a user's behalf). These never merge.

Consequences:
- `plugin-api-keys` is untouched by this work. It is not a credential source and never feeds pieces. Its hashing design is correct for its job and incompatible with outbound use by construction.
- The `batch_plan.md` premise that Batch 1 SecretText pieces ride on `plugin-api-keys` is **withdrawn**. Outbound secrets need retrievable (encrypted) storage — that is the connections collection.

## Decision 2 — `connections` Is a Core Collection, Chat Idiom

Core, not plugin, because multiple independent consumers need it (the pieces runtime, `plugin-oauth`, and core's own `secret` source) and because agents/pieces are core concepts that must resolve credentials without requiring any plugin to be installed.

Mechanics, copied from the chat pattern:
- Role marker `connections: true` on a user collection to adopt/extend; default collection injected with slug `connections` when any consumer is active (pieces configured, or a credential source registered); unmarked same-slug collection is the same hard error chat uses.
- Internal fields are reserved (declaring them throws) or type-locked, exactly as chat reserves `user`/`parts`/`thread`.

Internal fields:

| Field | Type | Protection |
|---|---|---|
| `owner` | relationship → auth collection | reserved |
| `service` | text, canonical service ID (`google`, `slack`, `linear`) | reserved |
| `source` | select: `oauth` \| `secret` | reserved |
| `credentialType` | select: `oauth2` \| `secret_text` \| `basic_auth` \| `custom` | reserved |
| `sourceKey` | text (which provider/source instance) | reserved |
| `encryptedCredentials` | text, `access.read: () => false`, hidden | reserved |
| `scopes` | text array | reserved |
| `status` | select: `active` \| `error` \| `revoked` | reserved |
| `accountId` / `accountLabel` | text (dedupe + display) | reserved |
| `expiresAt` | date | reserved |
| `metadata` | json (instance subdomains, team IDs — the pieces `data`/`props` gap) | type-locked, extendable |

`encryptedCredentials` holds **one encrypted JSON document**, not a single token. `credentialType` says how to interpret it when handing it to a piece:

| `credentialType` | Decrypted shape | Example |
|---|---|---|
| `oauth2` | `{ access_token, refresh_token?, expires_in?, scope, data }` | Google, Slack, GitHub |
| `secret_text` | `{ value }` | Linear, Airtable, Stripe |
| `basic_auth` | `{ username, password }` | Twilio, Trello |
| `custom` | the piece's own `props` object, verbatim | Zendesk `{ email, token, subdomain }` |

**Google service account:** it is just `custom`. Activepieces declares it as `PieceAuth.CustomAuth` with a single `serviceAccountJson` LongText prop (verified in `google-vertexai/src/lib/auth.ts`), so the entire JSON key file is one string prop value. It gets encrypted inside the same JSON document as any other custom credential — no special field, no special code path. Any piece needing a service account works the same way.

Users extend with their own fields freely (tenant fields compose here, matching the chat merge behavior).

Access defaults: owner-scoped read; `create/update/delete: () => false` with lifecycle endpoints using `overrideAccess: true` — same lockdown both existing plugins use.

Server API in core: `frogbot.connections.resolve({ service, owner })` → decrypted credential in the Activepieces-compatible `AppConnectionValue` shape; `list`, `revoke`. Resolution order per `unified_connections.md` (explicit assignment → single claiming source → boot error).

## Decision 3 — Encryption Moves to Core

Promote `plugin-oauth/src/server/crypto.ts` into `packages/frogbot` as the core credential-encryption utility: same versioned format (`v1.` prefix preserves already-written ciphertexts), key derived from `config.secret` with a core-owned derivation label, pluggable override on the config for KMS. `frogbot.encrypt/decrypt` (Payload passthrough) remains for general use; connections use the versioned AEAD utility exclusively.

Derivation label note: the existing label is `frogbot:plugin-oauth:`. Keep decrypt-compat by attempting the core label first, then the legacy label, re-encrypting on next write. Cheap now, impossible after external adopters exist.

## Decision 4 — `plugin-oauth` Becomes a Credential Source

The plugin keeps everything protocol-shaped: provider objects, authorize/callback/refresh/revoke endpoints, `oauth-states`, PKCE, step-up authorization. It stops owning storage:

- Its `oauth-connections` collection is retired; it writes to the core `connections` collection (`source: 'oauth'`, `sourceKey: providerId`, provider's canonical service ID in `service`).
- Its crypto util is replaced by the core one (re-exported for compat during transition).
- It registers itself as a credential source through a core registration hook (a well-known key plugins set on the config; core validates and indexes at sanitize time).

Since the plugin is unreleased, this refactor has no migration cost. Doing it before first release is the entire point of deciding now.

## Decision 5 — Core Covers Exactly Activepieces' Four Auth Types

Activepieces has four credential shapes (plus `None`). Core covers all four; nothing else is needed for full catalog coverage:

| AP auth type | Frogbot source | Notes |
|---|---|---|
| `PieceAuth.OAuth2` | `oauth` — `plugin-oauth` | Authorization-code flow, refresh, revoke |
| `PieceAuth.SecretText` | `secret` — core | Single API key |
| `PieceAuth.BasicAuth` | `secret` — core | Username + password |
| `PieceAuth.CustomAuth` | `secret` — core | Arbitrary prop set: subdomains, service-account JSON, region hints |
| `PieceAuth.None` | none | Batch 0 pieces |

The `secret` source is built into core: an owner-scoped endpoint accepts the credential fields the piece declares, encrypts them into `connections`, done. No plugin required, so Batch 1 depends only on core. It is small enough (one endpoint plus a form) that plugin-izing it would be ceremony.

`custom` is the one that needs a real UI story: the fields are piece-declared, so the connect form is generated from the piece's `props`. This is also where the `metadata` field earns its place — a Zendesk subdomain is needed to build every request URL, not just to authenticate.

## Decision 5a — Managed Brokers Are Out of Scope

Third-party credential brokers (the Composio/Nango/Arcade category) are **deferred entirely** and are not part of this architecture. `unified_connections.md` records why the proxy-only ones were rejected outright; the token-yielding ones are simply a later feature, not a v1 concern.

Consequence: `source` has exactly two values. If a broker source is ever added, it becomes a third `source` value and a new plugin registering through the same hook — additive, no schema change to existing rows. Nothing in v1 should be shaped around the possibility.

## Decision 6 — Placement: Contract and Runtime Both in Core, OAuth as a Plugin

- **Core:** piece interface, `pieces` config array, connections collection + resolution + encryption, the `secret` source, tool exposure.
- **Plugin:** `plugin-oauth` as the only credential-source plugin.

The earlier "runtime as auto-applied plugin" idea is dropped: the runtime is collection injection + credential resolution, and core already does exactly this kind of work for chat. An auto-applied internal plugin would be indirection with no consumer.

Rationale for pieces-in-core restated: agents are core, tools are core, and a piece's tools must be referenceable from `AgentConfig.tools` with zero additional installation.

## Decision 6a — Repo Layout: `packages/pieces/` and `packages/plugins/`

Piece wrapper packages do not go in `packages/`. At 40–50+ wrappers they would bury the 22 real packages (`frogbot`, `gateway`, `next`, db/storage/email/kv adapters). They also do not go in `packages/plugins/` — pieces and plugins are distinct concepts and each gets its own directory.

```
packages/
  frogbot/  gateway/  next/  db-*/  storage-*/  email-*/  kv-*/
  pieces/
    piece-text-helper/
    piece-linear/
    ...
  plugins/
    plugin-api-keys/        (moved)
    plugin-oauth/           (moved)
```

Requires adding `"packages/pieces/*"` and `"packages/plugins/*"` to `pnpm-workspace.yaml`. Package names are unchanged (`@frogbotai/plugin-oauth`, `@frogbotai/piece-linear`) — this is a directory move only, so no consumer impact. The rule: piece wrappers live in `packages/pieces/`, installable plugins live in `packages/plugins/`.

## Decision 7 — Tool Granularity: Per-Action Tools, Agent-Level Opt-In

One AI SDK tool per exposed piece action — but tools only exist on agents that select them, which is how Frogbot already works (`tools` is inline per agent, no global registry). There is no "700 tools registered" failure mode because there is no global registration.

Selection surface:

```ts
import { linear } from '@frogbotai/piece-linear'

pieces: [linear({ /* per-piece config if any */ })],
agents: [{
  slug: 'assistant',
  tools: [
    ...linear.tools(),                          // curated default set
    ...linear.tools(['create_issue', 'search']), // explicit subset
    myCustomTool,
  ],
}]
```

- Each wrapper declares a **curated default set** (the useful actions, not all of them — Slack's default is not 25).
- `piece.tools()` returns AI SDK-compatible `Tool` objects whose `execute` resolves the connection via `frogbot.connections.resolve({ service, owner: ctx.req.user })` and invokes the AP action with a constructed context.
- Tool slugs are namespaced `{service}_{action}` to avoid collisions with user tools.
- Per-agent counts stay a config-review concern, documented with guidance (≈20–40 tools per agent as the practical ceiling).

## Decision 8 — Property Schema Policy

Static dropdowns preserve their declared option value types as literal unions. Dynamic dropdowns remain described strings because their async choices depend on runtime auth and other inputs. Dynamic properties are freeform objects because actions consume their named fields as an object. No boot-time resolution, caching, or companion option-list tools are included in v1.

Evidence: the 13 Batch 0 wrappers were loaded through the local agent-tool contract and their schemas and execution paths were exercised locally. `image_helper_rotate_image` declares numeric static values (`90`, `180`, `270`), so a string schema rejects valid action input. HTTP `authFields` and GraphQL `proxy_settings` are dynamic properties whose actions read named object fields, so a string schema cannot execute those paths. Local HTTP and GraphQL fixture calls, file URL resolution, and image/file/PDF writes passed through the generated tools. No external provider or live model run was performed, so this decision establishes schema correctness and local tool usability rather than claiming model-selection evidence.

## What Changes Where

| Piece of work | Repo location | Depends on |
|---|---|---|
| Core connections collection + marker + merge | `packages/frogbot` (new `connections/`) | — |
| Core encryption util (promoted) | `packages/frogbot` | — |
| Credential-source registration hook | `packages/frogbot` | connections |
| Built-in `secret` source + endpoint | `packages/frogbot` | connections, crypto |
| `frogbot.connections.resolve/list/revoke` | `packages/frogbot` | all above |
| Piece contract + `pieces` config array | `packages/frogbot` | — |
| Workspace globs + move existing plugins | `pnpm-workspace.yaml`, `packages/pieces/`, `packages/plugins/` | — |
| Refactor `plugin-oauth` to source model | `packages/plugins/plugin-oauth` | registration hook |
| `plugin-api-keys` | directory move only, no code change | — |
| Batch 0 wrappers | `packages/pieces/piece-*` | piece contract only |

Batch 0 depends only on the piece contract and tool exposure — none of the connections machinery — so it can start as soon as the contract lands, in parallel with the connections work. Batch 1 gates on connections + the `secret` source. Batch 2 gates on the `plugin-oauth` refactor.

## Deferred Explicitly

- Managed broker credential sources (Decision 5a).
- Trigger/job system (unchanged from `batch_plan.md`).
- Store/StoreScope host contract (needed by the `store` piece and polling dedup; design with the job system).
- Admin UI for connections beyond the collection's default admin views.
- Frogbot-native `approval`/`delay`/`webhook` equivalents backed by Frogbot collections.
