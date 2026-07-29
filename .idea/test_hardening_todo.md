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

## Completed with Ticket 23

- [x] Assert `frogbot dev` generates the import map before starting Next and honors the user-facing opt-out.
- [x] Verify a plugin admin-component string generates a resolvable import-map entry and keep its build/start documentation accurate.

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
