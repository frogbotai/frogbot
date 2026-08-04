# Step 3: Development Plan

**Branch:** `fix/streaming-afterupstream-response`

## Stage 1: Add Streaming Hook Regression Coverage

- Goal: Prove the HTTP streaming path drops the assembled response.
- Dependencies: Existing responses route stream harness and `afterUpstream` hook fixture support.
- Expected changes: Extend the responses route spec with a fully drained streaming request and an `it.fails` assertion that the hook receives `response.messages`.
- Verification: Run the focused spec and confirm the expected-failure test passes only because the product assertion fails.
- Risks or open questions: Use the AI SDK assembled response rather than provider-return metadata if the mock does not expose a direct response fixture.
- Canonical contract: `AfterUpstreamHookArgs` through the real responses HTTP route.

## Stage 2: Forward the Assembled Response

- Goal: Restore streaming/non-streaming `afterUpstream` parity at the owning boundary.
- Dependencies: Stage 1 committed with demonstrated pre-fix failure.
- Expected changes: Extend `StreamLifecycle.onFinish` and `fireAfterUpstream` inputs with optional `response`, forward it to hooks, and pass `event.response` on successful completion. Convert the regression from `it.fails` to `it`.
- Verification: Run the focused spec, gateway package tests, root non-live suite, and e2e suites where practical.
- Risks or open questions: None; error and abort paths remain unchanged.
- Canonical contract: Shared `createStreamLifecycle` implementation and existing `AfterUpstreamHookArgs`.
