# Step 3: Development Plan

**Branch:** `feat/key-budgets`

## Stage 1: Contract Tests

- Goal: Lock cascade, field access, errors, rate behavior, model enforcement, settlement, reset, and alerts before implementation.
- Dependencies: Current main with plugin roles and provider allowlists.
- Expected changes: Add failing focused tests at plugin and gateway contracts; cover key and user aggregation paths.
- Verification: Run focused tests and confirm failures are caused by missing policy behavior.
- Risks: Time-dependent tests require an injected clock.
- Canonical contracts: plugin options, Payload fields/jobs, gateway hooks/errors.

## Stage 2: Policy Schema and Resolution

- Goal: Establish one typed policy source and deterministic cascade.
- Dependencies: Stage 1.
- Expected changes: Add defaults/options and key/user fields for budget, RPM, TPM, models, persisted spend, reset period, and alert state; add `resolvePolicy({ key, user, defaults })`.
- Verification: Pass cascade, config composition, conditional-field, and roles field-grant tests.
- Risks: Custom collection fields retain merge precedence; reserved policy names fail clearly.
- Canonical contracts: API-key/auth collections and `canField('budgets:manage')`.

## Stage 3: Admission and Model Enforcement

- Goal: Reject requests before upstream work when policy is exceeded.
- Dependencies: Stage 2.
- Expected changes: Add policy gateway errors; resolve caller policy in `beforeOperation`; enforce budget and sliding-window RPM/TPM; enforce runtime models in `beforeUpstream` after model parsing while provider allowlists remain in force.
- Verification: Pass 403/429 envelope, retry metadata, key/user rate, and allowlist tests across hook paths.
- Risks: In-memory windows are process-local; TPM admits against completed usage and can overrun by in-flight requests.
- Canonical contracts: gateway lifecycle and provider model identity.

## Stage 4: Settlement, Alerts, and Reset

- Goal: Persist completed spend and token usage and maintain period lifecycle.
- Dependencies: Stage 3.
- Expected changes: Add `afterOperation` settlement; serialize in-process updates per key/user while using Payload read-modify-write persistence; register monthly reset task; send deduplicated 80%/100% webhooks with `block` or `alert-only` semantics.
- Verification: Pass counter aggregation, update-failure logging, threshold deduplication, reset, and alert-only tests.
- Risks: Cross-process writes can lose increments because Payload has no atomic increment; counters are governance controls, not billing records.
- Canonical contracts: usage cost calculation, Payload local API/jobs, logger.

## Stage 5: Documentation and Integration Verification

- Goal: Publish supported policy behavior and scaling boundaries.
- Dependencies: Stages 1-4.
- Expected changes: Document configuration, grants, lifecycle timing, eventual consistency, process-local limits, reset, and webhook payloads; record implementation summary.
- Verification: Run focused/full tests, build, and applicable e2e without direct lint/typecheck commands.
- Risks: Credentialed live tests may be unavailable and must be reported.
- Canonical contracts: plugin docs/navigation and package exports.
