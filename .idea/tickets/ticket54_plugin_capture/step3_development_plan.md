# Step 3: Development Plan

**Branch:** `feat/plugin-capture`

## Stage 1: Package Contract and Capture Regression Tests

- Goal: Establish the public options, storage, policy, and blob contracts with failing behavior tests.
- Dependencies: Ticket 53 on current main.
- Expected changes: Add package metadata and tests for hook composition, default-off behavior, language snapshots, gzip blobs, streaming response data, errors, and isolated storage failures.
- Verification: Run the focused package spec with expected-failure assertions.
- Risks or open questions: Error serialization must preserve useful standard `Error` fields.
- Canonical contract: FrogBot AI hooks and the operation context bag.

## Stage 2: Capture Pipeline

- Goal: Implement faithful request/response capture through the existing lifecycle.
- Dependencies: Stage 1 tests.
- Expected changes: Add `capturePlugin(options)`, filesystem/custom storage, request-level policy state, gzip serialization, and fire-and-forget writes named `{requestId}.json.gz`.
- Verification: Convert Stage 1 tests to passing; run focused and package tests.
- Risks or open questions: Fire-and-forget tests must await the observable storage promise without coupling request completion to it.
- Canonical contract: Existing hook arrays remain additive.

## Stage 3: API-Key Policy Integration

- Goal: Add visible per-key policy without coupling either plugin package to the other.
- Dependencies: Stage 2 pipeline and API-key plugin running first.
- Expected changes: Inject `capture` and conditional `captureSampleRate` fields into the configured key collection; load policy from the authenticated key; use explicit `apiKeysCollectionSlug` for renamed collections.
- Verification: Write policy precedence and renamed-collection tests first, then run both plugin package suites.
- Risks or open questions: Missing configured key collections should fail configuration rather than silently lose policy.
- Canonical contract: Existing API-key collection and `req.user.apiKeyId` authentication projection.

## Stage 4: Retention

- Goal: Make finite retention operational rather than declarative.
- Dependencies: Storage contract from Stage 2.
- Expected changes: Add a scheduled cleanup task, filesystem cleanup implementation, configurable retention days/cron, and validation requiring custom cleanup support for finite retention.
- Verification: Write cleanup and jobs-composition tests first; run focused and package tests.
- Risks or open questions: Cleanup failures should fail the job for Payload retry/visibility, not affect AI traffic.
- Canonical contract: Payload Jobs Queue task and autorun configuration.

## Stage 5: Public Documentation and Integration Verification

- Goal: Publish a complete install/configuration contract and verify the workspace integration.
- Dependencies: Stages 1-4.
- Expected changes: Add package README, Mintlify plugin page/navigation, policy/storage/retention examples, and implementation summary.
- Verification: Run focused tests, both affected package suites, full non-live tests, package/root build, and applicable gateway e2e; skip only unavailable external-service suites with exact reasons.
- Risks or open questions: None.
- Canonical contract: Official plugins navigation and package export conventions.
