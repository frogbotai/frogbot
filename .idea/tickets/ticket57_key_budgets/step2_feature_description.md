# Step 2: Feature Description

## Problem

Administrators cannot cap AI spend or traffic by credential or user, and cannot constrain runtime model access below provider-wide configuration. Members who manage their own keys must not be able to raise governance limits.

## User Stories

- As an administrator, I want default and override policies so that unmanaged credentials remain governed.
- As an administrator, I want user budgets to aggregate all keys so that creating another key cannot bypass a cap.
- As an operator, I want threshold webhooks so that approaching and exhausted budgets are observable.
- As a member, I want to use and revoke my keys without being able to increase their limits.

## Core Requirements

- Resolve every dimension through key, user, config default, then unlimited, with explicit `inherit`, `custom`, and `unlimited` modes.
- Reject exhausted blocking budgets and disallowed models with distinct 403 codes; reject RPM/TPM excess with 429 and retry metadata.
- Intersect runtime model policy with provider allowlists and enforce only after the parsed model is available.
- Settle key/user spend and token windows after completion; reset monthly spend through Payload jobs; deduplicate 80% and 100% alerts.
- Protect policy and counter fields with `canField('budgets:manage')`; ordinary key ownership access must not grant cap updates.

## Shared Component Inventory

- API-key collection and modal: extend the canonical collection only; no new UI surface.
- Auth collection: inject matching user policy/counter fields into the configured auth collection.
- Gateway hooks/errors: reuse canonical lifecycle hooks and error envelopes.
- Provider allowlists: retain the existing `resolveProvider` policy as the provider-wide source; runtime policy is an additional restriction.
- Usage lifecycle: reuse `afterOperation`, where final token usage and cost are available.
- Roles: reuse the shipped `canField` adapter and `budgets:manage` grant.

## User Flow

1. An administrator configures defaults and optional key/user overrides.
2. A caller authenticates with a key or session.
3. FrogBot resolves the effective policy and admits or rejects budget/rate usage.
4. After model parsing, FrogBot rejects models outside runtime or provider policy.
5. Completion usage updates rate/spend state and emits each configured threshold alert once.
6. The monthly task resets spend and alert state.

## Success Criteria

- Cascade, blocking/alert-only behavior, rate windows, and model restrictions pass focused tests for key and session callers.
- Members without `budgets:manage` cannot update policy or counters.
- Concurrent settlements never claim billing-grade accuracy; failures are logged and later requests use persisted state.
- Focused, full, build, and applicable e2e suites pass.
