# Test Hardening TODO

## Implement now

### P0 — Make the test suite trustworthy

- [ ] Remove `gateway-e2e` from the default `pnpm test` run. Its credential-gated live matrix accounts for roughly 400 reported skips and should run only through explicit live-E2E commands or a credentialed CI job.
- [ ] Remove duplicate collection between `unit` and `gateway-unit`, and between `int` and `gateway-integration`, in `vitest.config.ts`.
- [ ] Decide whether to include, consolidate, or delete the currently uncollected `test/gateway/zen*.e2e.spec.ts` files.
- [ ] Include or relocate `packages/gateway/test/routes/chat-completions.spec.ts`, which is outside every configured project.
- [ ] Reconsider `passWithNoTests: true` so an accidentally empty project cannot pass silently.

### P0 — Fix accepted failures

- [ ] Fix the active `it.fails` case in `test/gateway/chatP2wire.int.spec.ts` and convert it to a normal passing integration test.
- [ ] Fix the two active `it.fails` cases in `test/gateway/messagesP2wire.int.spec.ts` and convert them to normal passing integration tests.
- [ ] Replace the permanently skipped JSON response-format live test in `test/gateway/zen.chat.e2e.spec.ts` with deterministic provider-fixture coverage.

### P1 — Complete first-party TODO tests

- [ ] Implement the 11 config-loading TODOs in `packages/frogbot/src/config/load.spec.ts`.
- [ ] Implement the 10 type-generation TODOs in `packages/frogbot/src/bin/generateTypes.spec.ts`.
- [ ] Implement the 5 import-map generation TODOs in `packages/frogbot/src/bin/generateImportMap.spec.ts`.
- [ ] Implement the CLI TODO in `packages/frogbot/src/bin/index.spec.ts`.
- [ ] Implement the unfinished `singleUser` and `workspaceWithFiles` clear-and-seed scenarios and add database contract coverage.

### P1 — Repair golden and compatibility coverage

- [ ] Separate stream golden fixtures from embedding, image, video, speech, transcription, and rerank fixtures so non-stream fixtures do not produce false `missing chunks.txt` TODOs.
- [ ] Record OpenAI and Anthropic expected SSE output for the five existing stream fixtures.
- [ ] Make missing required golden files fail instead of registering runtime TODOs.
- [ ] Add deterministic contract coverage for R2 behavior that does not require a Workers binding; keep the real binding integration test explicitly deferred.

### P1 — Run service-backed integration coverage in CI

- [ ] Add CI jobs for PostgreSQL, MongoDB, and SQLite integration suites.
- [ ] Start Redis in CI and require all 8 KV contract tests to run.
- [ ] Start supported storage emulators in CI and require S3, GCS, Azure, and Vercel Blob contract suites to run.
- [ ] Replace broad reachability-based `ctx.skip()` behavior in CI with a hard setup failure; retain convenient local skipping.

### P1 — Improve live-provider suite structure

- [ ] Do not construct text scenario suites for Voyage, Deepgram, ElevenLabs, or Fal entries without text models; this currently creates roughly 64 meaningless skips.
- [ ] Use one consistent gate for live provider, modality, credential, and tier tests.
- [ ] Add or explicitly separate the oversized-prompt fixture instead of creating one skipped test per provider.
- [ ] Split live-provider results from deterministic E2E results in scripts and reporting.

## Implement with the related feature

- [ ] Add `tools`, `tool_choice`, and `parallel_tool_calls` translator tests when chat-completions forwarding support is implemented.
- [ ] Implement the real Cloudflare R2 binding integration test when a supported test runtime or emulator is available.
- [x] Exercise generated formatting beyond print width so codegen tests verify layout as well as token presence. Completed with Ticket 51.

## Completed with Ticket 23

- [x] Assert `frogbot dev` generates the import map before starting Next and honors the user-facing opt-out.
- [x] Verify a plugin admin-component string generates a resolvable import-map entry and keep its build/start documentation accurate.

## Completed with Ticket 26

- [x] Exercise at least one tool-bearing path through a real `Tool.execute`, the real AI SDK tool loop, and persisted transcript read-back.

## Coverage balance to preserve

- Unit tests for config, validation, translators, adapters, and utilities.
- UI component tests under jsdom.
- Type/API contract tests for public exports and inference.
- Database integration tests across PostgreSQL, MongoDB, and SQLite.
- Redis and storage adapter contract tests.
- Gateway route, wire-format, security, billing, hooks, and error integration tests.
- Golden provider-fixture compatibility tests.
- Package and Next.js production-build acceptance tests.
- Deterministic application E2E tests for scaffold, cold startup, REST, and chat behavior.
- Separate opt-in live-provider E2E matrices for text and every supported modality.

## Skip inventory

The reported skip count is primarily environmental rather than 400 missing implementations:

- Roughly 413 collected live gateway matrix/scenario tests are disabled when `RUN_E2E` or credentials are absent.
- Roughly 32 Redis and storage tests skip when local services are unavailable.
- Roughly 34 explicit first-party TODO tests exist across CLI, config, gateway forwarding, and R2.
- Roughly 25 golden TODOs are produced by incomplete fixtures or incorrect fixture classification.
- Three active expected-failure integration tests keep known broken behavior green.
- Several test files are not collected at all and therefore do not appear in the skip count.

## Batch 4 lessons (issues #32–#36, #26 — triaged 2026-07-29)

Suite-level gaps surfaced while researching tickets 28–32. Each is a *class* of missing
test, not a single case.

### P0 — the suite asserted the bug

- [ ] `packages/frogbot/src/agents/endpoints.spec.ts:357-368` ('continues anonymous
      threads after agent access succeeds') encodes the #32 security hole as expected
      behavior, and its `findByID` mock is owner-blind so no ownership assertion is even
      possible. Fixed as part of ticket 28, but audit the rest of the suite for the same
      pattern: tests written to lock in whatever the code did, on paths where the
      contract was never stated.
- [ ] No access-control test crosses identities. Every thread/message spec runs as one
      caller. Add a shared fixture with two authenticated users plus an anonymous caller
      and assert the full matrix on every persistence path (JSON, SSE, local API).

### P0 — type-level assertions cannot fail

- [ ] `expectTypeOf` is used in `packages/frogbot` (`types/ai.spec.ts`, `frogbot.spec.ts`,
      +5 more) but is completely unenforced: `packages/frogbot/tsconfig.json` excludes
      `src/**/*.spec.ts` and no vitest project enables `typecheck`. Public type-surface
      assertions are decorative today. Add a `tsconfig.typetest.json` + a
      `typecheck:types` script wired into CI (ticket 29 Stage 1 introduces this — make it
      repo-wide afterward).
- [ ] Both hand-written-public-type defects so far (#14 `tools: []`, #33 logger) shipped
      because no test compares a declared public type against the runtime it fronts. Add
      contract tests for public types that wrap a third-party runtime (logger/pino,
      provider entries, tool shapes).

### P1 — adapters between two correct layers are untested

- [ ] `toGatewayLogger` (`packages/frogbot/src/ai/init.ts:108-125`) silently drops every
      structured field from gateway observability logs in production, with zero tests:
      `ai/init.spec.ts` never passes a `logger`. Both sides were individually correct.
      Audit every FrogBot↔gateway adapter/shim for the same untested-seam pattern.
- [ ] Copy the real-pino capture harness at
      `packages/gateway/src/observability/logger.spec.ts:188-232` into `packages/frogbot`
      so log assertions check serialized output, not call spies (`pino` is not currently
      resolvable from `packages/frogbot`).

### P1 — no UI test harness for plugins

- [ ] `vitest.config.ts`'s `ui` project only collects `packages/ui/src/**/*.spec.tsx`, so
      nothing under `packages/plugins/**` can have a component test. Extend jsdom+RTL
      collection to plugin client components (ticket 31 Stage 1 does this for
      `plugin-api-keys`; generalize it).
- [ ] `packages/plugins/plugin-api-keys/src/client.spec.ts:3-8` and
      `importMap.spec.ts:12-17` mock `@payloadcms/ui` with hand-written factories that
      break whenever a component imports a new primitive. Replace with a shared mock that
      fails loudly on unmocked exports instead of silently returning undefined.

### P1 — dead code passes as enforcement

- [ ] `resolveProvider`'s `models` parameter has no production call site — only unit
      tests pass it (ticket 30). Unit tests that construct arguments no caller supplies
      give false confidence in an enforcement path. Add an integration-level assertion
      per enforcement mechanism proving it fires through a real route/SDK entry, and
      treat "only unit tests exercise this argument" as a review flag.
