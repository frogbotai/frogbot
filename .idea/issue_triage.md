# Issue Triage — Issues #10+

## How Triage Works (mandatory — read before starting any batch)

1. **Read this file end to end first.** It holds every prior batch, priority calibration, and overlap analysis. New batches append at the bottom as `# Issue Triage — Batch N (Issues #X–#Y, triaged <date>)`.
2. **Ticket numbering:** ticket numbers continue from the highest existing `.idea/tickets/ticketNN_*` folder. They do NOT match GitHub issue numbers — the mapping is recorded in each triage entry (`(#NN)` in the heading).
3. **Artifact chain per ticket:** triage batch entry here → `.idea/tickets/ticketNN_name/research.md` → step1–step3 files → step4, following `.idea/feature_process/FEATURE_DEVELOPMENT_PROCESS.md`. Each step gates on the owner's explicit "Approved Step N". Match the format of recent ticket folders before writing anything.
4. **Delegate the digging:** per-issue evidence gathering goes to the `research` subagent (one research doc per assignment, parallel where independent); codebase verification goes to `explore` agents; lint/typecheck goes to the `lint` agent. The orchestrator reads process docs, dispatches, and synthesizes — it does not grep its way through triage itself.
5. **Verify before writing:** never write triage entries or research conclusions from issue text alone. Every root-cause claim is verified against source (this repo and the reference repos) with `path:line` citations, matching the standard of prior batches. Bug tickets must include a `Why Tests Missed It` audit feeding `.idea/test_hardening_todo.md`; feature proposals mark it N/A.
6. **Each batch ends with a Suggested Order table** (order, ticket, issues, priority, type) plus sequencing notes for dependencies and shared files.
7. **Research may not scope down an issue's central ask.** A research doc may recommend narrowing, but the narrowing is an owner decision — surface it explicitly in the batch summary as "research recommends rejecting X" and get a ruling before step docs. (Batch 6, ticket 49: research quietly rejected #44's main request — PM agnosticism, the entire point of the ticket — and the batch entry presented the scoped-down version as settled. Owner overruled.)

---

Issues #1–#9 were triaged on 2026-07-22. New intake is restricted to issues #10 and above.

## Current status (2026-07-29)

Live GitHub open-issue snapshot:

- **Older stragglers:** #1 Fix UI issues; #2 No link to github on landing page or docs; #23 AgentConfig.triggers scheduled runs.
- **Already triaged/prepared:** #26 API-key usage-log attribution; #32 thread access bypass; #33 logger type; #34 model allowlist; #35 API-keys modal UI; #36 MCP support question.
- **New/untriaged:** #37 OAuthPluginOptions missing providers.

Every other numbered GitHub issue through #36 is closed. Internal tickets without GitHub issues are not represented by GitHub open/closed state.

---

## Ticket 8 — Add Prettier and canonical app structure (#10)

**Priority: P2 (examples/templates/DX)**

Examples and the shipped blank template have no formatting command or self-contained Prettier dependency. The small FrogBot apps also define collections and agents inline instead of following the `collections/` and `agents/` module layout demonstrated by `examples/business-qa`.

**Scope:**
- Add self-contained Prettier configuration, dependency, and write/check scripts to every example and `templates/blank`.
- Move inline collections and agents in `examples/simple`, `examples/standalone`, and `templates/blank` into `src/collections/` and `src/agents/` modules with barrel exports.
- Keep `examples/gateway` in formatting scope, but exclude it from FrogBot-specific folders because it has no collections or agents.
- Add scaffold regression coverage so the packed blank template preserves formatting support and the canonical folders.

**Files:** example/template `package.json` and Prettier config files; affected `src/frogbot.config.ts`; new `src/collections/*` and `src/agents/*`; `packages/create-frogbot-app/src/index.spec.ts`

---

## Ticket 9 — Decouple codegen from model validation (#11)

**Priority: P1 (codegen/DX)**

`generate:types` and `generate:importmap` load fully sanitized config and hard-fail on an agent/provider mismatch even though their outputs do not depend on agent model validity.

**Scope:** allow codegen config loading to report the mismatch without blocking output; preserve runtime hard failure; add actionable diagnostics and regression tests for both generators.

**Branch:** `fix/codegen-model-validation`

---

## Ticket 10 — Fix Next client wildcard boundary (#12)

**Priority: P0 (build blocker)**

`@frogbotai/next/client` combines `'use client'` with `export *`, which Next 15 rejects when the generated import map includes the default folder component.

**Scope:** remove the redundant boundary directive at the source export, prove package output remains branded, and add a real Next build regression covering the import-map path.

**Branch:** `fix/next-client-exports`

---

## Ticket 11 — Generate model catalogs from models.dev (#13)

**Priority: P1 (model DX/data quality)**

The autocomplete and gateway catalogs are independently hand-maintained, stale, and inconsistent.

**Scope:** add a deterministic maintainer-run sync with explicit provider mappings and overlays, generate both committed catalogs from one normalized source, regenerate AI types, and test deterministic output. Runtime fetching and first-party custom-model config are deferred.

**Branch:** `feat/model-catalog-sync`

---

## Ticket 12 — Allow empty agent tools (#14)

**Priority: P1 (config validation)**

The public type and tool runtime accept `tools: []`, but sanitization crashes config loading.

**Scope:** treat empty tools like omitted tools, retain array and per-tool validation, and add sanitize/runtime regression coverage. The analogous `stopWhen: []` behavior is not silently bundled without a separate contract decision.

**Branch:** `fix/empty-agent-tools`

---

## Ticket 13 — Persist userless agent runs (#15, #16)

**Priority: P1 (data persistence/security)**

Anonymous HTTP and trusted server-side runs share a `req.user` persistence gate even though agent access already decides whether the call may run.

**Scope:** persist identically for authenticated, anonymous, and server-side calls; store `user: null` when no user exists; use agent `access` as the call/continuation authority; cover REST/local create and continue paths. No opt-in flag, capability token, warning, or anonymous-only path.

**Branch:** `feat/userless-thread-persistence`

---

## Ticket 14 — Restore chat request bodies and scaffold coverage (#17, #18)

**Priority: P0 (shipped UI unusable)**

The UI transport hook replaces the AI SDK request body without restoring `messages`, so every shipped Chat submission sends `{}`. Existing UI, transport, and scaffold tests bypass body construction.

**Scope:** preserve the exact server body contract in the transport hook, improve request-body regression tests, and exercise the blank template's actual client path. Generic CI expansion is deferred.

**Branch:** `fix/chat-request-body`

---

## Ticket 15 — Move email warning to initialization (#19)

**Priority: P2 (logging/lifecycle)**

The no-email warning runs inside config sanitization, repeats during module evaluation, bypasses structured logging, and pollutes codegen/build output.

**Scope:** preserve the FrogBot noop adapter, emit through the FrogBot/Payload logger at each supported initialization path, suppress build/codegen noise, and test warning count plus branding.

**Branch:** `fix/email-warning-lifecycle`

---

## Ticket 16 — Gateway usage tracking (internal)

**Priority: P1 (enterprise observability)**

The gateway measures token usage per operation but nothing persists it; enterprises need per-request, per-user usage and cost attribution without storing message content.

**Scope:** add `cost` to the models.dev-synced `ModelCatalogEntry`, a `calculateCostUSD` utility, an injected `usage-logs` collection, and an internal fire-and-forget `afterOperation` hook writing one row per request; fix the four routes/operations that never populate usage. Billing/credits/limits, API-key attribution, and dashboards deferred. Reference: firmware `llmProxy` + `ApiUsageLogs`.

**Branch:** `feat/gateway-usage-tracking`

---

## Overlap Analysis

- **#8 ↔ #5**: Related but distinct. #8 is the root env-loading bug in the CLI; #5 is the config typing that forces `?? ''` (which masks #8's symptom). Fixing #8 does not fix #5, and vice versa. Keep separate, cross-link. #8's "secondary improvement" (distinguish absent vs empty apiKey) belongs with #5's fix.
- **#3 ↔ #4**: Both `create-frogbot-app` scaffold decisions. Small enough to combine into one ticket.
- **#5 ↔ #7**: Both provider/agent config typing DX, but different surfaces (apiKey optionality vs model-string intellisense). Keep separate.
- Everything else is independent.

---

## Ticket 1 — Cold REST request crashes: singleton never initialized (#9)

**Priority: P0 (bug, crashes with valid config)**

First request to `POST /api/agents/:slug` or `GET /api/agents` returns 500 (`Cannot read properties of undefined (reading 'agents')`) because the Frogbot singleton is only registered via `getFrogbot()`, which only the AI gateway route calls. Payload's generic REST handler path never initializes it, so `req.frogbot` is undefined until `/api/ai/*` has been hit once.

**Scope (per issue's suggested fix, options 1+2):**
- Guard `agents/endpoints.ts` handler: lazily resolve instance or return a clear error instead of raw TypeError.
- Make `@frogbotai/next` `REST_*` wrappers ensure `getFrogbot({ config })` has run before delegating to Payload's handler.
- Regression test: cold REST request against a fresh instance succeeds.

**Files:** `packages/frogbot/src/agents/endpoints.ts`, `packages/frogbot/src/config/sanitize.ts` (wrapEndpointHandler), `packages/next/src/routes/*`, `packages/frogbot/src/instanceRegistry.ts`

---

## Ticket 2 — CLI codegen commands don't load `.env` (#8)

**Priority: P0 (bug, breaks codegen out of the box for the shipped template)**

`generate:types` / `generate:importmap` import `frogbot.config.ts` in a bare Node process with no `.env` loading; `dev`/`start` only work because Next loads env itself. Any config reading `process.env.*` (the template default) fails codegen with a misleading `Provider '<x>' requires an apiKey` error.

**Scope (per issue's suggested fix):**
- Load env at top of `bin()` in `packages/frogbot/src/bin/index.ts` before any command reads config. Decide loader: `process.loadEnvFile()` (zero-dep, `.env` only) vs `@next/env` as a real dependency (exact dev/start parity incl. `.env.local` / `.env.<mode>`).
- Regression test: temp config reading a key from `process.env`, temp `.env`, run codegen without pre-set var, assert success.
- Fix `templates/blank/README.md`: the `set -a; source .env` incantation is attached to `pnpm dev` (which doesn't need it) instead of codegen (which does).

**Cross-link:** the better error message for absent-vs-empty apiKey goes in Ticket 3.

**Files:** `packages/frogbot/src/bin/index.ts`, `packages/frogbot/src/bin/generateTypes.spec.ts`, `templates/blank/README.md`

---

## Ticket 3 — Provider `apiKey` typing forces `?? ''` (#5)

**Priority: P1 (DX/types)**

`[provider]: { apiKey: string }` rejects `process.env.X` (`string | undefined`), forcing users to write `?? ''` — which then trips the non-empty sanitize check anyway. Investigate how the AI SDK handles this (its providers accept `apiKey?: string` and fall back to a default env var per provider).

**Scope:**
- Make `apiKey` optional / accept `string | undefined` in config types.
- Decide sanitize behavior: follow AI SDK convention (fall back to the provider's standard env var, e.g. `OPENAI_API_KEY`, resolve at use-time) and/or fail with a clear message.
- Implement #8's secondary improvement here: distinguish absent key from empty string, error hint mentions the env var and `.env` loading.

**Files:** `packages/frogbot/src/types/*` (provider config types), `packages/frogbot/src/config/sanitize.ts` (~line 166)

---

## Ticket 4 — `agents` config validation: non-empty requirement (#6)

**Priority: P1 (DX/validation)**

`generate:types` fails with `` `agents` must be a non-empty array when configured `` — decide whether an empty `agents: []` (or omitted agents) should be valid. A user may want the admin/collections side without agents yet, and codegen shouldn't hard-fail on it.

**Scope:**
- Decide: allow empty array (treat as no agents) vs keep the throw. Leaning allow — an empty array is harmless and blocks nothing.
- Update sanitize + tests + generated-types behavior for the empty case.

**Files:** `packages/frogbot/src/config/sanitize.ts`, `packages/frogbot/src/config/sanitize.spec.ts`

---

## Ticket 5 — Agent `model` intellisense (#7)

**Priority: P1 (DX/types)**

Two complaints: (a) intellisense on `model` in agent config is bad, (b) it suggests models for providers the user hasn't configured. Model suggestions should be scoped to configured providers.

**Scope:**
- Investigate current `model` typing (likely a wide union or plain string).
- Ideal: make the model union generic over the configured `providers` keys so only `configuredProvider/model` strings are suggested. May require config-level generics or a builder pattern — scope the feasibility first.
- Fallback if generics are impractical: keep the full union but organize/document it better.

**Files:** `packages/frogbot/src/types/*` (agent/model types), possibly `buildConfig` signature

---

## Ticket 6 — `create-frogbot-app` scaffold decisions (#3, #4)

**Priority: P2 (scaffolding/DX)**

Two small scaffold items, combined:

1. **#3**: Approve `sharp` and `esbuild` build scripts in the scaffolded app via `allowBuilds` in an emitted `pnpm-workspace.yaml` (pnpm ≥10.26; `onlyBuiltDependencies` is deprecated/removed in v11) so installs don't prompt or silently skip native builds.
2. **#4**: Decide `src/` handling — should the scaffold offer/support a `src/` layout (like `create-next-app`'s prompt) or standardize on no-`src`? Pick one, make template + importMap/type paths consistent with it.

**Files:** `packages/create-frogbot-app/*`, `templates/blank/*`

---

## Ticket 7 — Site/UI polish: landing page + docs GitHub links (#1, #2)

**Priority: P2 (UI/docs)**

1. **#1**: Fix site UI issues — screenshots (viewed) show the **landing page** (not admin UI): the floating chat widget occludes the "Who It's For" cards, a stray caret artifact sits in the chat input, and the marketing docs site clips its right-hand TOC/header at ~1145px. **Blocker: the landing page / marketing docs source is not in this repo** (copy grep: zero matches) — location needed from the user.
2. **#2**: Add GitHub repo link to the landing page and docs — the docs half is actionable here (`docs/docs.json` `footer.socials.github` + navbar entry).

**Files:** `docs/docs.json`; landing repo TBD (external)

---

## Suggested Order

| Order | Ticket | Issues | Priority | Type |
|-------|--------|--------|----------|------|
| 1 | Cold REST crash | #9 | P0 | bug |
| 2 | CLI `.env` loading | #8 | P0 | bug |
| 3 | apiKey typing | #5 | P1 | dx |
| 4 | agents non-empty validation | #6 | P1 | dx |
| 5 | model intellisense | #7 | P1 | dx |
| 6 | create-frogbot-app scaffold | #3, #4 | P2 | chore |
| 7 | UI polish + GitHub links | #1, #2 | P2 | ui/docs |

Notes:
- Tickets 2 and 3 touch the same sanitize error path — land Ticket 2 first, then Ticket 3 builds the better error on top.
- Tickets 3, 4 are both small sanitize/type changes and could share a branch.
- Ticket 7 (#1) is blocked on locating the landing-page/marketing-docs repo (not in this monorepo).

---

# Issue Triage — Batch 3 (Issues #20–#31, triaged 2026-07-28)

Several are critical regressions in 0.7.0 that shipped past the suite. Per the updated
process, every bug ticket's research must include a `Why Tests Missed It` audit feeding
`.idea/test_hardening_todo.md`.

## Ticket 17 — Usage logs: role-marked collection + authenticated read (#20)

**Priority: P1 (framework collection pattern / admin visibility)**

Injected `usage-logs` collection is hard-coded by slug, invisible in admin (`read: () => false`), and only customizable by slug collision. Issue proposes a `usageLog: true` role marker following the thread/message/file pattern, authenticated-read default, resolved-slug threading into `logUsage`.

**Scope:** marker type + zero-or-one validation, marker-based `resolveUsageCollection` retaining resolved slug, `logUsage` writes to resolved slug, default `read: ({ req }) => Boolean(req.user)`, preserve merge guarantees, docs. Full acceptance list in issue.

**Files:** `packages/frogbot/src/ai/usageCollection.ts`, `packages/frogbot/src/ai/logUsage.ts`, collection config types, marker validation, docs.

## Ticket 18 — Transient init failure permanently bricks the server (#21, #29)

**Priority: P0 (unrecoverable server, two compounding caches)**

One invariant: a failed first init must be retryable. Two broken caches violate it:
- **#29**: `getFrogbot.ts` caches a rejected init promise in `globalThis._frogbot` forever.
- **#21**: Payload's `getPayload` retry sets `disableOnInit: true` even when the failed first init never ran `onInit`, so FrogBot's instance registration is skipped and `attachFrogbot` throws on every request. Issue proposes lazy fallback in `attachFrogbot` (re-run `initFrogbotFromPayload` when `getFrogbotInstance` is undefined) and/or an honest error.

**Scope:** clear failed promise on rejection (guarded against clearing newer attempts); lazy registration fallback in `attachFrogbot`; regression tests for rejection-retry and skipped-onInit paths.

**Files:** `packages/frogbot/src/getFrogbot.ts` (+spec), `packages/frogbot/src/config/sanitize.ts`, `packages/frogbot/src/instanceRegistry.ts`.

## Ticket 19 — create-frogbot-app must opt out of pnpm 11 minimumReleaseAge (#22)

**Priority: P0 (fresh apps fail to install for 24h after every release)**

pnpm 11's default 24h `minimumReleaseAge` makes every newly published FrogBot release fail `pnpm install` in generated apps (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`). Scaffolder should write `minimumReleaseAge: 0` to `pnpm-workspace.yaml`; excludes are not durable.

**Files:** `packages/create-frogbot-app/src/index.ts:32-35`, `packages/create-frogbot-app/src/index.spec.ts:89-100`.

## Ticket 20 — AgentConfig.triggers: scheduled agent runs (#23)

**Priority: P2 (feature proposal, large, well-specified)**

Full design doc in issue: `triggers` union (`prompt` xor `handler`), `every`/`cron(+timezone)` schedules, Payload Jobs backend via one generic task, user-null thread persistence per invocation, skip-overlap default, no missed-occurrence replay. Depends on userless thread persistence (ticket 13 / #15–16 work). Research validates the design against current core, sequences prerequisites, and scopes a v1.

**Files:** `packages/frogbot/src/types/agent.ts`, `agents/instance.ts`, `chat/threadContext.ts`, `config/sanitize.ts`, Payload jobs integration (new).

## Ticket 21 — JSON agent endpoint persists twice and 500s (#24)

**Priority: P0 (critical 0.7.0 regression on the core value path)**

`POST /api/agents/:slug` (JSON branch) runs `resolveThreadContext` in the endpoint AND again inside `agent.generate` → duplicate thread, duplicate message ID, 500 before the model is invoked. Regression boundary: `baabd33` (userless persistence). Issue validates fix: JSON branch calls `agent.aiAgent.generate` with already-resolved context, matching SSE. Explicit test-gap callout: endpoint spec mocks `agent.generate`; every e2e reads one SSE chunk and never checks persistence. Required: real JSON e2e with status 200 + exactly-one-thread/user/assistant persistence assertions, plus a fully consumed SSE e2e with the same assertions.

**Files:** `packages/frogbot/src/agents/endpoints.ts` (+spec), `packages/frogbot/src/agents/instance.ts:273-280`, `test/e2e/scaffold.e2e.spec.ts`, `test/e2e/coldRest.e2e.spec.ts`.

## Ticket 22 — Docs code blocks lack TypeScript syntax highlighting (#25)

**Priority: P2 (docs)**

Config example (api-keys plugin page and possibly others) renders without TS highlighting — likely fenced blocks missing a language tag. Audit `docs/**/*.mdx` for untagged fences.

**Files:** `docs/**/*.mdx` (audit), offending plugin docs page.

## Ticket 23 — API keys plugin: dashboard creation + usage-log attribution (#26, #27)

**Priority: P1 (plugin capability/clarity; #27 ambiguous pending research)**

- **#26** (question): does the plugin add an optional api-key property to the internal usage-logs collection so usage is attributable per key? Research answers from source; if absent, scope the attribution field (coordinates with ticket 17's resolved-slug work).
- **#27** (screenshot, terse): "Can create api keys in dashboard" — research must determine whether this reports a bug, a security concern (secret exposure in admin), or a feature confirmation, from the plugin's current admin config.

**Files:** `packages/plugin-api-keys/*`, `packages/frogbot/src/ai/usageCollection.ts`, `logUsage.ts`.

## Ticket 24 — Bedrock: resolve the standard AWS credential chain (#28)

**Priority: P1 (auth gap; docs promise ambient credentials)**

Gateway `fromEnv` for bedrock reads only static env keys / bearer token — no `AWS_PROFILE`/SSO, web identity, ECS/EC2 metadata. Fix: fall back to AWS SDK default credential provider chain passed to `createAmazonBedrock` as `credentialProvider` when explicit keys/bearer are absent; keep existing precedence; consider exposing `credentialProvider` in `BedrockProviderEntry`.

**Files:** `packages/gateway/src/providers/bedrock/index.ts` (+spec), `packages/frogbot/src/types/ai.ts`, `packages/frogbot/src/ai/init.spec.ts`, `docs/configuration/ai.mdx`.

## Ticket 25 — Default auth token prefix "frogbot" over "payload-token" (#30)

**Priority: P2 (branding invariant)**

Terse issue: default the auth cookie/token prefix so users see `frogbot-token`, not `payload-token`. Research maps Payload's `cookiePrefix` (auth collection config) and every consumer (admin UI, REST auth, `@frogbotai/next`) plus migration impact on existing sessions.

**Files:** `packages/frogbot/src/config/sanitize.ts`, auth-related defaults, docs.

## Ticket 26 — Real-server e2e: tool calling on a free model (#31)

**Priority: P1 (test infrastructure; release gate)**

Terse issue: basic e2e on a real frogbot server using a free opencode model confirming tool calling works end to end. Complements ticket 21's persistence e2e. Research picks the model/gating strategy (free tier vs credential-gated), harness placement, and assertions (tool invoked, result round-tripped, transcript persisted).

**Files:** `test/e2e/*`, e2e harness, CI wiring.

## Suggested Order

| Order | Ticket | Issues | Priority | Type |
|-------|--------|--------|----------|------|
| 1 | JSON agent double persistence | #24 | P0 | bug |
| 2 | Init failure recovery | #21, #29 | P0 | bug |
| 3 | CFA minimumReleaseAge | #22 | P0 | bug |
| 4 | Bedrock credential chain | #28 | P1 | bug |
| 5 | API keys plugin gaps | #26, #27 | P1 | bug/dx |
| 6 | Usage-logs role marker | #20 | P1 | feat |
| 7 | E2E tool calling | #31 | P1 | test |
| 8 | Token prefix | #30 | P2 | feat |
| 9 | Docs syntax highlighting | #25 | P2 | docs |
| 10 | Agent schedule triggers | #23 | P2 | feat |

Notes:
- Ticket 18 and ticket 21 both stem from 0.7.0-era init/persistence changes; land 21 first (isolated), then 18.
- Ticket 26 (#31) should land after ticket 21 so the new JSON/SSE e2e and the tool-calling e2e share a harness.
- Ticket 23's #26 attribution field interacts with ticket 17's resolved usage-collection slug — sequence 17 before 23 if the field ships.
- Ticket 20 (#23) depends on userless thread persistence shipped in 0.7.0 (ticket 13) and on ticket 21's fix to the persistence composition.

## Ticket 27 — Port the firmware chat UI to replace @frogbotai/ui (no issue yet)

**Priority: P1 (product quality; owner-directed)**

The current `@frogbotai/ui` chat interface (Vercel AI Elements-based) is not acceptable. The original intent was a direct port of the existing firmware UI (`~/Documents/Code/firmware`: `apps/web`, `apps/extension`, `apps/desktop`, `packages/ui`, `packages/ai-chat`), including its multimodal input, not a rebuild on AI Elements. Research scopes the port: inventory the firmware components, map dependencies/transport differences, and define the replacement plan for `@frogbotai/ui`.

**Files:** `packages/ui/*`, firmware repo (read-only reference), templates/examples consuming `@frogbotai/ui`.

---

# Issue Triage — Issues #32+ (2026-07-29)

Batch 4 intake: issues #32–#36. Also reopens #26 (see Ticket 23 note below).

## Ticket 28 — Unauthenticated thread read/write via inverted overrideAccess (#32)

**Priority: P0 (security — cross-user data disclosure and injection)**

`chat/threadContext.ts` sets `overrideAccess: !req.user` at both `resolveThreadContext` and `resolveThreadId`, so anonymous callers bypass access control entirely while authenticated callers get ownership enforcement. With sequential integer thread ids, an anonymous loop over `threadId` dumps and writes into every conversation in the database. Regression from the #15/#16 userless-persistence work (ticket 13): anonymous persistence was enabled by bypassing access control instead of relaxing it. Research must settle the core design: framework-internal persistence should behave identically regardless of user collection access rules (`overrideAccess: true` for writes), which requires an explicit framework-level ownership guard on the `threadId` path — plus a product decision on what anonymous callers may reach (unguessable thread token vs session scoping).

**Files:** `packages/frogbot/src/chat/threadContext.ts`, `packages/frogbot/src/chat/collections/threads.ts`, ticket 13/21 history, `test/e2e/*`.

## Ticket 29 — Logger type forbids pino's structured form, permits silent field drops (#33)

**Priority: P1 (DX/type correctness — silent data loss)**

`frogbot.logger` is Payload's pino instance, but FrogBot re-declares a narrower `Logger`/`LogFn` type (`msg: string` first, mandatory), so pino's correct `logger.info(obj, msg)` form is a type error while the accepted `logger.info(msg, obj)` form silently discards the object (printf interpolation with no placeholder). Same class of defect as #14: hand-written public type disagreeing with the runtime it fronts. Research decides between re-exporting payload/pino's logger type vs widening `LogFn` with correctly-ordered overloads, and audits every internal `frogbot.logger` call site for the same trap.

**Files:** `packages/frogbot/src/frogbot.ts` (logger assignment + `Logger` type), internal logger call sites, Payload logger typing (`~/Documents/Code/payload`).

## Ticket 30 — Per-provider `models` allowlist: runtime enforcement + narrowed types (#34)

**Priority: P1 (feature — org-level model governance; intentional breaking change)**

Proposal: optional `models` field on built-in provider entries (consistent with custom openai-compatible entries) making the catalog authoritative for routing — omitted → full catalog strict; set → only listed models route. Enforced post-canonicalization in `resolveProvider` (uniform across HTTP routes, in-process SDK, agents), reflected by `GET /v1/models`, validated at boot, and mirrored in the type layer (`generate:types` narrows `GeneratedTypes.models`; `ModelId` drops the `(string & {})` escape hatch). Breaking: un-cataloged model ids stop routing even with no allowlist. Larger feature — may be sequenced like ticket 20; research first.

**Files:** `packages/gateway/src/config/schema.ts` + `parse.ts`, `resolveProvider`, models route, `packages/frogbot/src` config sanitization + type generator, `docs/gateway/configuration.mdx`, `docs/gateway/providers.mdx`.

## Ticket 31 — plugin-api-keys: single button + modal, following the Firmware design (#35)

**Priority: P1 (UI parity — owner-directed design contract)**

The api-keys plugin admin UI must follow the Firmware repo's API-key design exactly (see CLAUDE.md "UI Parity with Firmware"): a single button in the collection list view opening a modal — state 1 create (name input + Create API key), state 2 one-time reveal in the same modal (copy + dismiss, dismiss refreshes list). The current `beforeListTable` inline panel is the wrong surface; endpoints and copy are fine. Reference implementation: `~/Documents/Code/firmware/apps/web/src/collections/ApiKeys/components/CreateApiKeyButton.tsx` (and its collection wiring); use `@payloadcms/ui` primitives (`useModal`/Drawer). Revoke becomes a row-level action.

**Files:** `packages/plugin-api-keys/src/client/ApiKeysManager.tsx` (replaced), `packages/plugin-api-keys/src/collection.ts` (component injection point), firmware repo (read-only reference).

## Ticket 32 — MCP server support in agent tools (#36)

**Priority: P2 (question → likely feature scoping)**

User asks whether an MCP server connection (with their own keys/creds) can back entries in `AgentConfig.tools: []`. Research answers from source: what `tools` accepts today, whether AI SDK's MCP client (`~/Documents/Code/ai` — `experimental_createMCPClient` / MCP tool support) can be bridged through FrogBot's tool config, how opencode wires MCP tools, and what a first-class `mcp` piece/adapter would look like. Outcome is either a documented recipe or a scoped feature ticket — do not invent API surface beyond answering the question.

**Files:** `packages/frogbot/src/agents/*` (tool resolution), `packages/frogbot/src/types/agent.ts`, AI SDK MCP client source, `docs/agents/*`.

## Ticket 23 addendum — #26 reopened for implementation

#26 was answered ("no, not today") but is NOT resolved: the attribution field is wanted, and its stated prerequisite — ticket 17's `usageLog` marker / resolved-slug work — has shipped (`ae16964`). Revise `ticket23_api_keys_plugin/research.md` for implementation: strategy attaches the key's id (per the `_strategy` precedent), `logUsage` writes it, the plugin merges the optional field into the marker-resolved usage-log collection. Keep core plugin-agnostic.

## Suggested Order (batch 4)

| Order | Ticket | Issues | Priority | Type |
|-------|--------|--------|----------|------|
| 1 | Thread access bypass | #32 | P0 | security |
| 2 | Logger type | #33 | P1 | bug/dx |
| 3 | api-keys button + modal | #35 | P1 | ui |
| 4 | #26 attribution (ticket 23) | #26 | P1 | feat |
| 5 | MCP tools answer/scoping | #36 | P2 | research |
| 6 | Model allowlist | #34 | P1 | feat (large — may wait, like ticket 20) |

## Ticket 33 — Unguessable public thread ids — NOT PLANNED (owner decision 2026-07-29)

**Status: closed as not planned, same day it was opened. Do not research or implement.**

Briefly split out of ticket 28, then cut by the owner as over-scoped for the actual risk.
Recorded here so it is not re-proposed without new information.

**What it would have fixed:** ticket 28's ownership guard cannot separate two *anonymous*
callers (anonymous threads store `user: null`, so the guard compares `null !== null` and
passes) and thread ids are sequential integers, so anonymous thread enumeration survives.

**Why it was cut:**
- The exposure requires an app author to explicitly write `access: () => true` on an agent —
  a deliberate act in their own code. There is no default-on path that reaches this, and no
  authenticated user's data is exposed (ticket 28 closes that completely).
- The fix is disproportionate: a Payload custom ID field on `threads` changes the thread id
  *shape*, which drags in a migration for existing numeric ids, the `messages.thread`
  relationship, generated types, and the public API shape for any client that stored a
  numeric `threadId`.
- Anonymous multi-turn agents are rare in practice.

**What we do instead:** document the limitation. Ticket 28 gains a docs line stating that
with anonymous agent access enabled, anonymous threads are not private to the anonymous
caller who created them, and that apps handling sensitive conversations should require
authentication. Ticket 28 keeps its `it.skip` case as the executable record of the known gap.

**What would reopen this:** a real user enabling anonymous agent access on sensitive threads,
or anonymous access becoming a default/templated posture rather than an explicit opt-in. If
reopened, the design is settled — custom Payload `id` field
(`payload/.../getCollectionIDFieldTypes.ts:18`, `configToJSONSchema.ts:901`,
`fields/config/sanitize.ts:295`), one uniform unguessable id across all adapters. Do NOT
rely on the adapter's native id shape: a Mongo `ObjectId` is a timestamp + per-process
random + incrementing counter, so it is not a secret, and Postgres/SQLite auto-increment is
trivially enumerable.

---

# Issue Triage — Batch 5 (Issues #38–#42, triaged 2026-08-01)

All five are feature proposals/explorations against 0.9.0 (`9eee185`), not bugs — bug-ticket
artifacts (`Why Tests Missed It`) are N/A across the batch. Four of the five are unusually
well-specified in the issue text itself (the author cites `path:line` against 0.9.0);
research's job is verification and design validation, not discovery. #37 (OAuthPluginOptions)
already shipped in `a46084d` and is closed — not part of this batch.

## Ticket 34 — AgentConfig.profile: agent identity via the manifest (#38)

**Priority: P1 (feature — multi-client agent identity; small, additive, fully designed)**

Agents are slug-only end to end; every client hardcodes a `slug → display name` map that
drifts and cannot respect per-caller `access`. Issue proposes an optional
`profile: { name, avatar, description }` on `AgentConfig`, forwarded verbatim by the
manifest and `GET /api/agents` (the profile IS the client-facing projection —
`instructions` excluded by construction). Naming is settled in the issue after three
revisions: `profile`, not `admin` (collides with `RootAdminConfig.avatar`, and Payload's
`admin` is surface-scoped, not audience-scoped) and not `display`. `avatar` is a plain
string — no import-map involvement (agents are stripped at `sanitize.ts:787`; a component
can't cross the manifest). Research verifies the six-step implementation chain's citations,
the UI attachment path (`renderMessage` forwarding vs default avatar render), and the open
`name` vs `label` question.

**Files:** `packages/frogbot/src/types/agent.ts`, `config/sanitize.ts` (sanitizeAgents),
`types/chat.ts`, `chat/manifest.ts`, `agents/service.ts`, `packages/ui/src/chat/*`.

## Ticket 35 — AgentConfig.skills: progressive-disclosure knowledge packages (#39)

**Priority: P2 (feature — large; agentskills.io-shaped skills served through three tools)**

Web-deployed agents have no filesystem, so skills can't be "files the agent reads" — the
framework serves them via `list_skills` / `load_skill` / `load_skill_resource`, matching
ADK and Microsoft Agent Framework. Issue proposes a plain `SkillConfig` (house style) with
a discriminated union: `source` folder (agentskills.io drop-in, L1 from frontmatter) XOR
declared `instructions`/`resources` (function content, Payload-pattern). L1 lines injected
into the system prompt; tools auto-registered only when `skills` is non-empty. Registry
name resolution only — no user string reaches `fs`. Research validates the union against
existing sanitize patterns, the system-prompt injection point, conditional tool
registration, and the `source` deployment story (copy vs `generate:skillsmap`, precedent:
importmap); Shape 2 can land first. `search_skill_resources` and collection-backed skills
explicitly out of v1.

**Files:** `packages/frogbot/src/types/agent.ts` (+ new skill types), `config/sanitize.ts`,
`agents/instance.ts` (prompt assembly + tool registration), new `skills/*` module,
opencode/ADK references.

## Ticket 36 — FrogbotConfig.tools: shared root tools on every agent (#40)

**Priority: P1 (feature — small; prerequisite for #41)**

Cross-cutting tools must be repeated per agent today. Issue proposes root
`tools?: readonly AnyTool[]` appended to every agent's toolset at sanitize time; slug
collision → agent-level wins with a warning; `inheritTools?: false` on `AgentConfig` opts
an agent out entirely. Root piece-backed tools validate against registered `pieces` once,
same as agent-level. Research verifies the sanitize append point, the collision/warning
mechanics against how toolsets are currently keyed, and whether warn-vs-error on collision
holds up.

**Files:** `packages/frogbot/src/types/config.ts`, `types/agent.ts`, `config/sanitize.ts`
(sanitizeAgents + new root-tool validation).

## Ticket 37 — Built-in thread todos: schema + prebuilt todo tools (#41)

**Priority: P1 (feature — depends on ticket 36/#40)**

Plan/progress state for long agent runs. Design settled through two issue revisions —
the body's default-on attachment is superseded: (1) `todos` JSON field ships on the
framework-owned threads collection unconditionally; (2) tools are explicit prebuilt
exports — `import { todoTools } from 'frogbot/tools'` — attached per-agent or via
ticket 36's root `tools` (first first-party consumer of #40); (3) `create-frogbot-app`
template attaches them at the root so new apps get todos visibly. `write_todos`
overwrites the whole list (Claude Code pattern), `read_todos` returns it. Schema opt-out,
if ever needed, is a widening of the thread role marker
(`thread?: boolean | { todos?: boolean }`) — v1 ships the plain boolean. Research verifies
the thread-marker merge path, the tool-export surface (`frogbot/tools` entry point exists?),
the thread update path tools must write through, and UI rendering of `thread.todos`.

**Files:** `packages/frogbot/src/chat/collections/threads.ts` (base fields), new
`tools/todos.ts` + package export, `templates/blank/src/frogbot.config.ts`,
`packages/ui/src/*` (checklist render), ticket 36 dependency.

## Ticket 38 — First-class web search for agents (#42)

**Priority: P2 (exploration — verify pieces path, then pick packaging)**

Scoped to fetch-based keyed vendor search (Brave/Tavily/Exa); provider-executed search
tools explicitly out of scope. The interesting claim: `createActivepiecesPiece` may make
this a config snippet already — research verifies that end to end (does the piece wrap
work, is the `propertiesSchema(action.props)` tool schema good enough for reliable model
use?). Then recommend packaging: docs recipe vs blessed first-party re-export vs
first-party hand-written tool. Open questions (vendor choice, UI citation rendering,
rate limiting) are recommendation material, not scope. Outcome may be a docs page rather
than code — that is a valid conclusion for an exploration ticket, unlike a deferral.

**Files:** `packages/frogbot/src/pieces/*` (read), Activepieces piece sources (read),
`docs/agents/*` or new piece package depending on outcome.

## Suggested Order (batch 5)

| Order | Ticket | Issues | Priority | Type |
|-------|--------|--------|----------|------|
| 1 | Root tools | #40 | P1 | feat (small; unblocks #41) |
| 2 | Thread todos | #41 | P1 | feat |
| 3 | Agent profile | #38 | P1 | feat |
| 4 | Web search exploration | #42 | P2 | research/feat |
| 5 | Agent skills | #39 | P2 | feat (large — sequence like tickets 20/30) |

Notes:
- Ticket 37 (#41) hard-depends on ticket 36 (#40) — `todoTools` attaches through root
  `tools`. Land 36 first; 37's template stage assumes it.
- Ticket 35 (#39) and ticket 36 (#40) both touch agent tool composition in sanitize;
  land 36 (small) before 35 (large) so skills' conditional tool registration composes
  with root tools rather than the reverse.
- Ticket 38 (#42) research may conclude docs-only; packaging decision goes to the owner
  before any new package is created.
- #38's `name` vs `label` open question is decided in step 1, not left to implementation.

## Batch 5 addendum — prerequisite bug surfaced by ticket 38 research (2026-08-01)

Ticket 38's "verify end-to-end" step **disproved** issue #42's central "may already work"
claim and uncovered a pre-existing, untested P1 bug that is NOT search-specific:
`adaptCredential`'s `secret_text` branch (`packages/frogbot/src/connections/adapters.ts:13`)
returns a bare string, but the real Activepieces engine contract — which every piece's own
code is written against — is `{ type: 'SECRET_TEXT', secret_text }`. 10+ shipped
`secret_text` pieces (Resend, Discord, Stripe, Monday, Linear, Attio, Telegram-bot,
Posthog, Airtable; plus Brave/Exa if wrapped) read `context.auth.secret_text`, get
`undefined`, and silently send `Bearer undefined`. No test exercises a real credentialed
action's real `run()` — every spec mocks `action.run` (the exact boundary hiding the
defect). Tavily only "works" because its own action code reads `auth` raw — two bugs
cancelling.

**Owner action:** file this as its own ticket (recommend P1, GitHub issue + ticket folder
next batch). Ticket 38's step 3 gates on it (Stage 0). Full mechanism, engine citations,
and regression-test spec: `ticket38_web_search/research.md` → Root Cause / Regression
Tests. Test-hardening lesson (real-`run()` credential specs) feeds
`.idea/test_hardening_todo.md` with that ticket.

**Resolution (2026-08-01):** owner confirmed. Ticket 39 created
(`tickets/ticket39_secret_text_credential_shape/`, `fix/secret-text-credential-shape`,
research + steps 1–3 complete; GitHub issue still to be filed). Owner also decided
ticket 38 packaging: blessed packages for **both Brave and Exa**
(`@frogbotai/piece-brave-search`, `@frogbotai/piece-exa`); Exa's `custom_api_call` is
excluded (upstream raw-`auth` bug). Batch order updated: 36 → 37 → 34 → 39 → 38 → 35.

## Ticket 48 — Agent config changes (access, instructions) are ignored until a full restart — cached Frogbot instance survives Payload's in-place HMR reload (#43)

**Priority: P1 (dev-only correctness bug, breaks the core agent-iteration loop; not a production security bypass)**

Confirmed and broadened. Payload's own `reload()` mutates the existing `payload`
object in place (`payload/src/index.ts:1045-1078`) — object identity is
preserved by design so its own long-lived references keep working across dev
HMR. FrogBot's `instanceRegistry.ts` WeakMap keys on that same identity
(`instanceRegistry.ts:14-16`) with no config comparison, so once a `Frogbot` is
cached for a `payload` object it is returned forever, even though
`frogbot.config.ts` is re-evaluated by Next's dev module graph on every save,
producing a fresh `FrogbotSanitizedConfig` that every lookup site
(`config/sanitize.ts:973-988`, `frogbot.ts:139-160`) silently discards on a
cache hit. Research found a **second, even stickier cache** the issue didn't
name: `getFrogbot.ts`'s process-global slot (`getFrogbot.ts:53-56`,
`cached.frogbot ??= frogbot`) is not even keyed by `payload` identity and is
exported publicly (`index.ts:23`). The staleness is also broader than
`access`/`instructions`: `frogbot.gateway`, `frogbot.collections`, and
`frogbot.connections` are all built once in `initFromPayload`
(`frogbot.ts:174-200`) and never rebuilt. Verified this is **dev-only** —
Payload's HMR-reload websocket is `NODE_ENV !== 'production'`-gated
(`payload/src/index.ts:1230`) — so the "security-shaped failure" is a local
QA-confusion risk, not a production access-control bypass; calibrated below
Ticket 18 (P0, unrecoverable server) and Ticket 28 (P0, actual prod cross-user
disclosure).

**Recommended fix** (not the issue's literal (c) minimal suggestion): extend
`instanceRegistry.ts`'s cache entry to store `{ frogbot, config }`, add a
config-reference-equality check at the lookup sites that already hold a fresh
config, and rebuild only the config-derived registries (`agents`, `gateway`,
`collections`, `connections`) on mismatch — mirroring Payload's own
`reload()`/`init()` split, which deliberately never re-runs `onInit` on HMR
reload (`payload/src/index.ts:1045-1117` has no `onInit` call, unlike
`BasePayload.init` at `:999-1011`). Rejects "(c) agents-only" as insufficient
(split-brain risk: `gateway` would stay stale while `agents` refresh) and
rejects a full `initFromPayload` re-run (would re-trigger `onInit`/telemetry
side effects Payload's own precedent avoids). `getFrogbot.ts`'s second cache
should collapse into the same decision rather than gain independent
invalidation logic.

**Files:** `packages/frogbot/src/instanceRegistry.ts` (+spec),
`packages/frogbot/src/getFrogbot.ts` (+spec), `packages/frogbot/src/frogbot.ts`
(`initFromPayload` + new rebuild method), `packages/frogbot/src/config/sanitize.ts`
(`attachFrogbot`).

**Branch (planned):** `fix/hmr-stale-instance`

---

# Issue Triage — Batch 6 (Issues #44–#52, triaged 2026-08-03)

Nine issues: three bugs (#46 small, #47 routing, #48 hook parity), one scaffold design
reversal (#44), one docs/API-surface item (#45), and four enterprise-gateway feature
proposals (#49–#52) that form a coherent arc: capture (#49) and reporting (#50) read
the data, roles (#51) and budgets (#52) control it. All research docs written and
review-gated (ten load-bearing claims spot-verified against source, all confirmed).
Bug tickets carry `Why Tests Missed It`; proposals are N/A.

## Ticket 49 — create-frogbot-app: scoped release-age exclusions (#44)

**Priority: P1 (owner-reviewed scope; narrows ticket 19's approach)**

The scaffolder writes `pnpm-workspace.yaml` with required `allowBuilds` entries and a
tree-wide `minimumReleaseAge: 0` (`packages/create-frogbot-app/src/index.ts:32-35`).
**Final owner ruling (2026-08-03): retain the workspace file and `allowBuilds`; replace
only the global opt-out with name-only exclusions for `frogbot` and `@frogbotai/*`.**
Package-manager detection, CLI/README command changes, workspace-file removal, and a
broad package-manager-agnostic redesign are out of scope. The existing exact-content
test is rewritten regression-first to enforce the narrower generated artifact.

**Files:** `packages/create-frogbot-app/src/index.ts` (+spec).

**Branch:** `chore/cfa-scoped-release-age`

## Ticket 50 — Gateway endpoint docs: /api/api, orphaned route table, namespace question (#45)

**Priority: P2 docs (parts 1–2, trivial); P-owner-decision (part 3)**

Three parts. (1) `docs/chat/manifest.mdx:6` is the only page using a *relative*
Mintlify `api:` path (`GET /api/frogbot`) against `docs.json`'s
`server: "https://app.frogbot.ai/api"` — hence the doubled `/api/api`; the other 13
api pages use absolute URLs. One-line fix. (2) The default-endpoint documentation the
issue asks for mostly exists (`docs/configuration/ai.mdx:379-391` has an accurate
`/api/ai/v1/*` table) but is orphaned — `docs/chat/*` and `docs/gateway/overview.mdx`
show unrelated/stale route sets; fix is cross-linking and reconciling, not new
content. (3) **DECIDED (owner, 2026-08-03): rename `/api/ai/v1/*` → `/api/v1/*`.**
Research confirms feasibility: Next static segments win over Payload's catch-all, so
the only collision is a user collection literally slugged `v1` — reserve it via the
existing reserved-slug pattern (like `agents`/`frogbot`); the hosted Cloud docs
already use `/api/v1`. This supersedes ticket 42's `/api/ai` namespace choice.
Breaking change accepted; owner ruled (same day): **hard cut, no deprecation alias**.

**Files:** `docs/chat/manifest.mdx`, `docs/gateway/overview.mdx`, `docs/chat/*`,
`docs/configuration/ai.mdx` (links); part 3: `packages/next` route mounting +
reserved slugs + gateway prefix stripping + docs sweep.

**Branch (planned):** `docs/gateway-endpoint-paths` (parts 1–2); `feat/api-v1-namespace` (part 3)

## Ticket 51 — generate:types: format the models union by default (#46)

**Priority: P2 (small DX bug)**

`buildGeneratedTypesFooter` builds the `GeneratedTypes.models` union via
`.join(' | ')` (`packages/frogbot/src/bin/generateTypes.ts:81`) and appends it raw
(`:195`) *after* json-schema-to-typescript's `compile()` already ran its internal
Prettier pass — two assembly paths, only one formatted. Fix at the owning boundary:
run the whole assembled artifact through one `prettier.format(..., { parser:
'typescript', singleQuote: true })` pass (prettier is already resolvable via
json-schema-to-typescript), not hand-crafted line wrapping. Verified live: Prettier
reproduces the issue's desired multi-line union byte-for-byte. Payload has the same
compile-then-append pattern; its footer is just never long enough to manifest.
No test codifies the inline shape (all assertions are `toContain` substrings).

**Files:** `packages/frogbot/src/bin/generateTypes.ts` (+spec).

**Branch (planned):** `fix/typegen-format`

## Ticket 52 — Bedrock Mantle models advertised but unroutable (#47)

**Priority: P1 (routing bug: catalog advertises models that 400 on every request)**

Both reporter claims verified. (1) `scripts/sync-catalog.mjs:66-103` `mapModel()`
never reads `model.provider`, flattening away models.dev's per-model
`{ npm: "@ai-sdk/amazon-bedrock/mantle", api, shape }` block — confirmed live against
current models.dev for exactly the 8 affected models. (2)
`packages/gateway/src/providers/bedrock/index.ts:73-99` always builds
`createAmazonBedrock`; "mantle" appears zero times in gateway or frogbot source.
Research findings beyond the issue: the `api` field is a required baseURL *override*
(6 of 8 models need `/openai/v1`, differing from the Mantle SDK default); Mantle's
`.languageModel()` aliases to Chat, so `.responses()` must be selected explicitly per
`shape`; the issue's opencode citation is real but only on upstream main (local
checkout predates Mantle). Fix: thread `sdk:{npm,api,shape}` through the sync into
`catalog.data.ts`; branch per-model inside `bedrockProvider.build` to lazily construct
`createBedrockMantle({ baseURL, ...creds })` with `.responses()`/`.chat()` dispatch —
no `ProviderDefinition.build` signature change, reusing ticket 24's resolved
credentials. Why tests missed it: no catalog fixture carries a non-null per-model
provider block; provider-construction specs never exercise a Mantle model.

**Files:** `scripts/sync-catalog.mjs`, gateway catalog data,
`packages/gateway/src/providers/bedrock/index.ts` (+spec), regression fixtures.

**Branch (planned):** `fix/bedrock-mantle-routing`

## Ticket 53 — Streaming afterUpstream omits the assembled response (#48)

**Priority: P1 (hook-surface parity on the dominant path; blocks #49)**

Issue fully confirmed against main: `streamLifecycle.ts:97` `fireAfterUpstream` has no
`response` field and the `onFinish` call site (`:142`) doesn't pass `event.response`,
while all three non-streaming branches do (`chatCompletions/handler.ts:319`,
`messages/handler.ts:333`, `responses/handler.ts:281`);
`AfterUpstreamHookArgs.response` is already optional (`hooks.ts:166`). AI SDK verified:
streaming `onFinish`'s `event.response` is structurally identical to `generateText`'s
`result.response` — true parity, not two shapes. A second in-repo precedent
(`modelHooks.ts` model-middleware afterUpstream) already carries `response` on both
paths. Abort/error paths deliberately never fire `afterUpstream` — out of scope, no
regression risk. Fix is ~4 lines in `streamLifecycle.ts`. Why tests missed it: pure
coverage gap — `handlerRunner.spec.ts` never covers the three language routes and the
responses streaming spec registers no hooks.

**Files:** `packages/gateway/src/shared/streamLifecycle.ts` (+spec), route hook specs.

**Branch (planned):** `fix/streaming-afterupstream-response`

## Ticket 54 — @frogbotai/plugin-capture: opt-in payload capture (#49)

**Priority: P1 (enterprise feature; gated on ticket 53)**

Design validates cleanly: `beforeUpstream` carries the canonical post-mutation
request, the mutable context bag is the sanctioned hook-to-hook channel,
`usage_logs.requestId` is indexed (though not unique — minor correction), the
`trackUsage === false` escape-hatch convention exists, and modality routes genuinely
don't expose inputs. Payload's `@payloadcms/storage-*` adapters verified as
collection-upload-coupled, so the plugin's own `storage: { put(key, bytes) }` option
is warranted, not a missed reuse. New risk surfaced: Node's built-in zstd requires
Node ≥22.15 and is experimental while the repo's engines floor is `>=20` — compression
choice is a step-1 decision — owner ruled (2026-08-03): gzip for v1 (`{requestId}.json.gz`),
zstd deferred until the engines floor rises. Remaining step-1 points: sampling unit, api-keys
collection-slug discovery for the injected `capture` field, and policy resolution for
in-process/agent calls where no API key exists. Ticket 53 confirmed as the sole
blocker for streaming capture.

**Files:** new `packages/plugins/plugin-capture/*`, hooks integration, docs.

**Branch (planned):** `feat/plugin-capture`

## Ticket 55 — Usage reports over usage_logs (#50)

**Priority: P1 (enterprise visibility; owner-revised plan adopted with one correction)**

Owner's three-tier comment plan validated: `admin.groupBy` exists (experimental,
findDistinct-backed, visual grouping only — no SUM) and `@payloadcms/plugin-import-
export` covers filtered CSV; Payload's local API confirmed to have no aggregate op.
One owner claim DISPROVEN: the tier-3 aggregation endpoint must NOT go "through the
drizzle adapter directly" — frogbot ships a real Mongo adapter
(`packages/db-mongodb`), so drizzle-direct SQL silently breaks Mongo deployments.
Firmware already solved this exact problem adapter-agnostically
(`firmware/apps/web/src/endpoints/analytics/utils.ts`: paginated `payload.find` +
in-memory reduction) and per the UI-parity rule its analytics dashboard is the spec —
scope is the models/users table + date-range slice (histogram/subscriptions tabs have
no frogbot analog). Gap: usage-logs has no `apiKey` field yet — `groupBy=apiKey`
depends on ticket 23's reopened attribution scope. Endpoint access is
`Boolean(req.user)` parity until #51 lands. Owner ruled (2026-08-03): ship as
`@frogbotai/plugin-usage-reports`, not core.

**Files:** new `packages/plugins/plugin-usage-reports/*`, usage collection config
(`admin.groupBy`), import-export adoption, report endpoint + admin Usage page,
firmware reference (read-only).

**Branch (planned):** `feat/usage-reports`

## Ticket 56 — @frogbotai/plugin-roles: RBAC compiled to access functions (#51)

**Priority: P1 (enterprise feature — large; sequence like tickets 20/30/35)**

Core premise "Payload already does the hard half" VERIFIED (nav hiding, field
disabling, `Where`-filtered lists, per-request permission computation all cited). Two
real corrections: (1) `AgentConfig.access` (`types/agent.ts:18-20`,
`({req}) => boolean`) and Payload's `Access` (`=> boolean | Where`) are structurally
different contracts — `can()` must be two thin adapters over one grant-lookup core,
not one universal function; (2) `req.user.roles` is NOT populated by default —
Payload's JWT strategy passes `auth.depth` (undefined by default) to `findByID`, so
the plugin must set/handle population explicitly. Field-level grants discovered to be
a hard dependency of ticket 57 (#52 budgets), not a deferrable v2 as the issue
suggests. Weakest areas: the plugin-to-plugin resource registry (no existing
precedent beyond raw config mutation) and the SSO `mapUser` hook (needs new surface
in both plugin-roles and plugin-oauth — separate coordinated stage; issue's claim
that plugin-oauth has no generic OIDC/claim mapping verified). Owner ruled
(2026-08-03) the issue's open question: **roles are defined in code** (plugin config,
git-versioned grants); **assignment happens at runtime** (relationship field on the
auth collection, editable in admin) — the runtime-editable roles collection/grants
editor from the issue is dropped (or a read-only projection), which also removes the
free-text-grants concern the resource registry existed to solve.

**Files:** new `packages/plugins/plugin-roles/*`, auth-collection field injection,
`can()` helpers, seeding, plugin-oauth hook point (follow-up).

**Branch (planned):** `feat/plugin-roles`

## Ticket 57 — Per-key budgets, rate limits, model allowlists (#52)

**Priority: P1 (enterprise enforcement — large; partial dependency on #51)**

Owner-revised policy cascade (key → user → config defaults → unlimited,
`inherit|custom|unlimited` field mode, per-user budgets aggregating across keys)
validated with two load-bearing corrections. (1) `beforeOperation` exists
(`hooks.ts:35-41,109-118`) and fires with auth/apiKey resolved — proven by ticket 23's
shipped hook — but BEFORE body parsing, so it has no model: budget/rate checks live
there, while the per-key model allowlist must enforce at `beforeUpstream`/
`resolveProvider`, where ticket 30's shipped per-provider allowlist already accepts a
request-scoped `allowlists` param — per-key lists intersect rather than duplicate (no
second source of truth) — off-allowlist models return **403** with a distinct policy
code (owner-decided; not 404 — the model exists, the key isn't permitted). (2) No
running `spendThisPeriodUSD` exists today — the api-keys plugin's `totalCostUSD` is a
virtual read-time SUM (`plugins/plugin-api-keys/src/collection.ts:110-145`), and
Payload has no atomic-increment primitive (verified across drizzle + mongo adapters),
so counters are net-new read-modify-write on the logUsage path with the issue's own
accepted eventual-consistency window. "Members can't raise their own caps" hard-
depends on #51's field-level `can()`; owner approved (2026-08-03) shipping enforcement
behind an interim admin-only field gate rather than blocking on #51 (end behavior must
match `can('budgets:manage')` once it lands). Owner also ruled: fold into
`@frogbotai/plugin-api-keys`, no separate plugin-budgets package.

**Files:** `packages/plugins/plugin-api-keys/*` (policy fields + enforcement wiring),
gateway `beforeOperation`/`resolveProvider` integration, logUsage counter path,
cron reset, webhook alerts.

**Branch (planned):** `feat/key-budgets`

## Suggested Order (batch 6)

| Order | Ticket | Issues | Priority | Type |
|-------|--------|--------|----------|------|
| 1 | Streaming afterUpstream response | #48 | P1 | bug (small; unblocks #49) |
| 2 | Bedrock Mantle routing | #47 | P1 | bug |
| 3 | Typegen union formatting | #46 | P2 | bug/dx (small) |
| 4 | /api/v1 rename + endpoint docs | #45 | P1 | feat/docs (owner-decided, hard cut) |
| 5 | CFA scoped release-age exclusions | #44 | P1 | chore |
| 6 | plugin-capture | #49 | P1 | feat (after 53) |
| 7 | Usage reports | #50 | P1 | feat |
| 8 | plugin-roles | #51 | P1 | feat (large) |
| 9 | Key budgets | #52 | P1 | feat (large; after 56 or interim gate) |

Notes:
- Ticket 53 → 54 is a hard dependency (streaming capture gets nothing without it).
- Ticket 55's `groupBy=apiKey` gates on ticket 23's usage-log attribution field;
  the rest of 55 is independent.
- Ticket 57's field-level-access requirement depends on ticket 56's `can()`; owner
  approved the interim admin-only gate so enforcement ships first; budgets fold into
  plugin-api-keys.
- Ticket 57's per-key model allowlist layers on ticket 30's shipped `allowlists`
  param — enforcement point is `resolveProvider`, NOT `beforeOperation` (issue text
  corrected by research).
- Ticket 50 part 3 (`/api/v1` rename) is DECIDED by the owner (2026-08-03) — in
  scope on its own branch; land parts 1–2 docs fixes only after the rename so the
  endpoint reference documents the new paths once, not twice.
- New packages: plugin-capture (54) and plugin-usage-reports (55) under
  `packages/plugins/`; roles (56) is its own plugin; budgets (57) folds into
  plugin-api-keys. 56 and 57 interact (field-level grants) — land 56's grant core
  before 57's field gates.
- Owner rulings recorded 2026-08-03 across the batch: 49 retains pnpm workspace/build
  approvals and scopes release-age exclusions by package name; 50 rename decided, hard cut, no alias; 54 gzip
  v1; 55 plugin; 56 code-defined roles + runtime assignment; 57 fold into
  plugin-api-keys + interim gate approved.
