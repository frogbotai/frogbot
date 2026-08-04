# Step 3: Development Plan

**Branch:** `feat/plugin-roles`

## Stage 1: Contract Tests

- Goal: Lock public types, grant semantics, config composition, and lifecycle behavior before implementation.
- Dependencies: Current main and ticket research.
- Expected changes: Add package tests for exact/wildcard grants, own scope, distinct access adapters, field grants, population handling, auth injection, first-user assignment, and idempotent synchronization.
- Verification: Run the focused package suite and confirm expected failures before implementation.
- Risks or open questions: None; SSO mapping is excluded because issue acceptance calls it a companion gap and plugin-oauth has no hook.
- Canonical contract: FrogBot access types and Payload relationship/hook behavior.

## Stage 2: Shared Grant Core and Adapters

- Goal: Implement one conservative grant resolver with consumer-specific return contracts.
- Dependencies: Stage 1 tests.
- Expected changes: Add role/resource/grant types; `can(permission, options?)` returning Payload `Access`; `canField(permission)` returning `FieldAccess`; and `canAgent(permission)` returning `AgentAccess`.
- Verification: Pass exact, wildcard, denied, own-query, field, and agent tests.
- Risks or open questions: Own scope defaults to the `user` owner field and is configurable per adapter call.
- Canonical contract: `Access`, `FieldAccess`, `AgentAccess`, and Payload `Where`.

## Stage 3: Collection and Auth Integration

- Goal: Expose code-defined roles as safe relationship targets and runtime assignments on users.
- Dependencies: Stage 2.
- Expected changes: Add `rolesPlugin(options)`; validate unique role/resource slugs and grants; inject or merge a read-only roles collection; append the auth relationship field; preserve auth config while setting depth to at least one.
- Verification: Pass composition, validation, depth, and populated/unpopulated relationship tests.
- Risks or open questions: Existing collections or fields with configured slugs fail clearly rather than merging ambiguous policy ownership.
- Canonical contract: FrogBot `Plugin`, `CollectionConfig`, and Payload auth depth.

## Stage 4: Lifecycle Seeding

- Goal: Synchronize policy projection and assign the first user without unsafe admin behavior.
- Dependencies: Stage 3.
- Expected changes: Compose `onInit` to upsert configured role documents with `overrideAccess`; compose an auth `beforeChange` hook that assigns the administrator role only when creating the first user and no role was supplied.
- Verification: Pass idempotency, existing-hook preservation, explicit-assignment preservation, and first-user tests.
- Risks or open questions: Removed code roles remain as historical relationship targets rather than being destructively deleted.
- Canonical contract: Existing FrogBot `onInit` composition and Payload create hooks/local API.

## Stage 5: Documentation and Verification

- Goal: Publish configuration and verify workspace integration.
- Dependencies: Stages 1-4.
- Expected changes: Add package metadata, README, Mintlify plugin page/navigation, examples for collection/field/agent adapters, and implementation summary.
- Verification: Run focused/full tests, build, and applicable e2e without direct lint/typecheck commands; report exact skips.
- Risks or open questions: External database/service e2e may require unavailable credentials.
- Canonical contract: Existing plugin package and documentation conventions.
