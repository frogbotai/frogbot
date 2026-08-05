## Stage 1 - Contract Tests
- Changes: Replaced request-level-only Bedrock cache tests with message, content-part, fallback, TTL, marker-consumption, and Nova no-op contracts; moved the SDK namespace contract to message level.
- Verification: Focused middleware and provider contract tests fail because `bedrockCachePoint` does not read `args.messages` or implement last-message fallback.
- Notes: Expected-red stage; translator-shaped message objects expose the original test blind spot.

## Stage 2 - Middleware Rewrite
- Changes: Added message and content-part marker conversion, validated `5m`/`1h` TTL handling, request-level last-message fallback, and consumed-marker cleanup while retaining the Claude model gate.
- Verification: Focused Bedrock middleware and provider contract tests pass (21 tests).
- Notes: Nova remains an untouched no-op; ticket 59 continues to own hook ordering and generic forwarding.

## Stage 3 - Wire-Level Tests
- Changes: Added mocked-fetch integration coverage for chat system/user markers and Messages system/text/tool-result markers through the real Bedrock SDK request serializer.
- Verification: Focused gateway integration wire tests pass (2 tests); Stage 1 contracts remain passing.
- Notes: No ticket 64 harness was present, so the test uses the existing in-process `createApp` and `postJson` pattern with the SDK's supported custom fetch seam.

## Stage 4 - Documentation and Integration Verification
- Changes: Documented supported Bedrock Claude marker positions, request fallback, TTL handling, Nova exclusion, and route/tool non-goals.
- Verification: Focused suite passes (23 tests); full gateway suite passes (1131 passed, 3 expected failures, 28 todo); `@frogbotai/gateway` package build passes.
- Notes: Live Bedrock credentials were unavailable; mocked-fetch tests validate the exact serialized Converse request body. Lint and typecheck are intentionally deferred to the required lint subagent.
