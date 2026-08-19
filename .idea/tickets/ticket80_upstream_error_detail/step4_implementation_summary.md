## Stage 1 - Acceptance Tests First
- Changes: No standalone failing tests added. Gateway tests do not use Vitest's expected-failure mechanism, so focused coverage will be added with each corresponding implementation stage.
- Verification: Confirmed no `fails`-tagged or `.fails()` gateway test pattern exists.
- Notes: This preserves a green commit series while retaining tests-first coverage at each implementation boundary.

## Stage 2 - Remove Production Error Drop
- Changes: Removed the production-only early return from `errorLog`; revised capture-logger and real-pino production tests to require the error object.
- Verification: `pnpm vitest run --root . --project=gateway-unit packages/gateway/src/observability/logger.spec.ts` passed (1 file, 15 tests). The plan's package-directory command found no tests because the Vitest root is the repository; reran with the configured root/project.
- Notes: Operator error logs now include the existing serialized error in every environment.

## Stage 3 - Enrich Error Serialization
- Changes: Added JSON-safe serialization for every own-enumerable error field, including AI SDK upstream diagnostics; capped `responseBody` at 2,048 UTF-8 bytes without splitting a code point.
- Verification: `pnpm vitest run --root . --project=gateway-unit packages/gateway/src/observability/logger.spec.ts` passed (1 file, 18 tests).
- Notes: The cap is bytes, not JavaScript characters. Circular, non-finite, bigint, symbol, function, date, URL, and throwing-property values cannot break the console-backed JSON logger.

## Stage 4 - Unwrap Retry Errors
- Changes: Reused `unwrapRetryError()` before serialization and added a real `RetryError` fixture that asserts the final `APICallError` details are logged without retry metadata.
- Verification: `pnpm vitest run --root . --project=gateway-unit packages/gateway/src/observability/logger.spec.ts` passed (1 file, 19 tests).
- Notes: `RetryError.lastError` is the installed AI SDK's final retry attempt; no retry-count field was added.

## Stage 5 - Align Pre-Resolution Logging
- Changes: Removed envelope-style production masking from `logGatewayError` and added a real-pino production test for the raw 500 message.
- Verification: `pnpm vitest run --root . --project=gateway-unit packages/gateway/src/observability/logger.spec.ts` passed (1 file, 20 tests).
- Notes: Client-envelope masking remains exclusively in the envelope layer.

## Stage 6 - Wire Proof And Final Verification
- Changes: Added a production mocked-provider wire test using the installed `APICallError` class, a real pino sink, and an exact client-envelope byte assertion.
- Verification: Logger unit coverage passed with 20 tests; `pnpm vitest run --root . --project=gateway-integration packages/gateway/test/upstreamErrorDetail.spec.ts` passed (1 file, 1 test); `pnpm --filter @frogbotai/gateway build` completed without diagnostics; `pnpm format:check` passed.
- Notes: The exact response body assertion preserves the existing 403 OpenAI envelope while the operator log gains upstream diagnostics.
