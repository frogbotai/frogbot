# Ticket 49 - Step 2: Feature Description

**Issue:** #44 | **Branch:** `chore/cfa-scoped-release-age` | **Research:** `./research.md` | **Step 1:** Option B

## Problem

Generated apps carry `minimumReleaseAge: 0`, unnecessarily disabling pnpm's dependency-age protection tree-wide. FrogBot packages need immediate availability, while third-party dependencies should remain subject to the user's pnpm policy.

## User Stories

- As a new FrogBot user, I want current FrogBot releases to install immediately so that scaffolding works on release day.
- As a security-conscious user, I want release-age checks to continue applying to unrelated dependencies.
- As a pnpm user, I want approved `sharp` and `esbuild` builds to remain zero-step.

## Core Requirements

1. Generated `pnpm-workspace.yaml` remains present.
2. Existing `allowBuilds` entries for `sharp` and `esbuild` remain unchanged.
3. `minimumReleaseAge: 0` is absent.
4. `minimumReleaseAgeExclude` contains only `frogbot` and `@frogbotai/*`, without versions.
5. CLI next steps, template README, and package-manager support remain unchanged.

## Shared Component Inventory

- `packages/create-frogbot-app/src/index.ts` - canonical generated workspace-config owner; narrowed in place.
- `packages/create-frogbot-app/src/index.spec.ts` - canonical packed-scaffold contract test; updated in place.
- `templates/blank/README.md` and CLI output - reviewed but unchanged.
- No UI, API, database, or shared runtime component is involved.

## User Flow

1. User scaffolds a FrogBot app.
2. The generated workspace config approves required builds and names only FrogBot packages as release-age exclusions.
3. pnpm installs current FrogBot packages immediately while retaining age checks for third-party dependencies.

## Success Criteria

- The regression test fails against the old generated content and passes after the change.
- The packed scaffold emits the exact reviewed YAML shape.
- Focused and full tests pass, with scaffold/e2e limitations reported separately.
