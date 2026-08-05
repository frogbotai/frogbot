## Stage 1 - Contract Tests
- Changes: Added middleware contracts for message, content-part, TTL-drop, request-level, and no-op behavior; corrected retention fixtures and added invalid-retention coverage; added composed HTTP contracts for both wire routes and the 400 error envelope.
- Verification: Focused tests fail at the intended missing hook export and retention validation boundaries.
- Notes: Reused the ticket 59 recording-model integration harness. No ttl-to-retention inference is expected.

## Stage 2 - Retention Enum Validation
- Changes: Constrained retention with `z.enum(['in_memory', '24h'])` and mapped invalid strings to `RequestValidationError` with the field name and allowed values.
- Verification: Focused parser tests and the composed chat-completions 400 contract pass.
- Notes: Valid cache keys and both valid retention values remain unchanged; marker TTL is not consulted.

## Stage 3 - Request-Level Breakpoint Hook
- Changes: Added and registered the OpenAI cache breakpoint hook; request-level cache control now sets an explicit breakpoint on the last message and removes the consumed generic field.
- Verification: Request-level and no-marker middleware contracts pass; the remaining focused failures are limited to Stage 4 message and content-part translation.
- Notes: Existing OpenAI message options are preserved. Requests without a cache marker are unchanged.

## Stage 4 - Message/Part-Level Breakpoint Translation
- Changes: Extended the OpenAI hook across messages and array content parts, consuming each cache marker into an explicit OpenAI breakpoint while preserving unrelated provider options.
- Verification: All middleware contracts and composed chat-completions/messages wire contracts pass, including Anthropic-wire-to-OpenAI translation and TTL drop.
- Notes: Relies on ticket 59's landed hook-before-drain ordering. TTL never produces retention or any OpenAI option.

## Stage 5 - Documentation and Integration Verification
- Changes: Documented OpenAI cache marker translation, the wire-correct retention enum, TTL drop, and excluded providers/routes; corrected the remaining invalid retention fixture.
- Verification: Gateway unit, integration, and golden suites pass: 124 files, 1,144 passing tests, 3 expected failures, and 28 todos. Focused contracts pass: 3 files and 38 tests.
- Notes: Build was not run because the gateway build invokes `tsc`. Lint/typecheck remain delegated to the parent lint agent. No credentialed live cache test was available. Option A is complete; ttl-to-retention inference remains explicitly excluded.
