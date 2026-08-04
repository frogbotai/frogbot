# Step 1: Solution Assessment

## Problem

FrogBot needs runtime-editable per-key and per-user AI policies without duplicating gateway routing policy or creating an unsafe cap-management surface.

## Option A: Extend `@frogbotai/plugin-api-keys`

- Pros: owns key identity and attribution; can inject key/user fields; reuses AI hooks and roles field grants; one policy source.
- Pros: covers API-key, session, agent, and local SDK paths through existing FrogBot hook lifting.
- Cons: broadens the plugin from authentication into credential governance.

## Option B: Add a separate budgets plugin

- Pros: narrower package name and independent adoption.
- Cons: duplicates key collection discovery and auth integration; creates plugin-order coupling; splits one credential policy across packages.

## Option C: Implement policy in gateway core

- Pros: closest to provider resolution and all route handlers.
- Cons: gateway has no Payload/key/user ownership; couples a standalone gateway to FrogBot persistence and roles.

## Recommendation

Choose Option A. `plugin-api-keys` owns policy schema, cascade, enforcement, counters, reset, and alerts. Budget/RPM checks run in `beforeOperation`; model checks run in `beforeUpstream` and layer on the existing provider allowlist; `afterOperation` settles TPM and spend using documented eventual-consistency read-modify-write updates.
