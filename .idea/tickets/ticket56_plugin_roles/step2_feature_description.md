# Step 2: Feature Description

## Problem

FrogBot has no reusable authorization vocabulary for separating administrators, members, and read-only users. Applications need code-reviewed grants with runtime role assignment that Payload's existing access system can enforce.

## User Stories

- As an administrator, I want roles defined in configuration so that authorization policy is versioned and reviewable.
- As an administrator, I want to assign roles from the user editor so that membership can change at runtime.
- As a developer, I want one grant vocabulary for collections, fields, and agents so that plugins compose consistently.
- As a member, I want own-scoped resources filtered automatically so that I cannot access another user's records.

## Core Requirements

- Ship `@frogbotai/plugin-roles` with code-defined roles and a read-only synchronized roles projection.
- Inject an editable roles relationship onto the configured auth collection and explicitly populate it for access checks.
- Share grant lookup while exposing distinct Payload Access, FieldAccess, and AgentAccess-compatible adapters.
- Compile `own` scope to a configurable owner-field query for Payload access and to boolean permission for agents.
- Seed configured roles safely and assign the first created auth user the configured administrator role.

## Shared Component Inventory

- FrogBot `Plugin`: extend the canonical serial config transformation contract.
- Payload collection and field access: reuse native enforcement, list filtering, nav hiding, and field disabling.
- `AgentConfig.access`: use a dedicated boolean adapter rather than widening its contract.
- FrogBot `onInit` and auth collection hooks: compose with existing callbacks instead of replacing lifecycle behavior.
- Payload admin collection editor: reuse the generated relationship control; no custom UI is needed.

## User Flow

1. Define resources and roles in `rolesPlugin()` configuration.
2. Use `can()` on collection access, `canField()` on controlled fields, and `canAgent()` on agents.
3. Start FrogBot; configured roles synchronize into the roles projection.
4. The first user receives the administrator role, and administrators assign later users from the auth editor.
5. Payload and FrogBot enforce grants through their existing access paths.

## Success Criteria

- Wildcard, exact, missing, and own-scoped grants resolve correctly across all adapters.
- Auth depth is at least one, populated role documents are handled explicitly, and malformed/unpopulated values never grant access.
- Existing auth fields, hooks, access, higher depth, collections, and `onInit` callbacks remain intact.
- Repeated initialization is idempotent and removes no runtime assignments.
- Focused/full tests, build, and applicable e2e complete successfully or have exact skips reported.
