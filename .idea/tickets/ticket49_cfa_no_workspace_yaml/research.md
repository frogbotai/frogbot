# Research: `create-frogbot-app` scoped release-age exclusions (issue #44)

**Status:** researched
**Revision:** 2026-08-03 - owner reviewed scope supersedes the earlier package-manager-agnostic ruling: retain `pnpm-workspace.yaml` and `allowBuilds`; replace only the global release-age opt-out.
**Ticket:** .idea/issue_triage.md -> Ticket 49
**Branch (planned):** chore/cfa-scoped-release-age

## Issue Summary

Every generated app currently receives `minimumReleaseAge: 0`, disabling pnpm's release-age protection for the entire dependency graph. The reviewed scope keeps the pnpm scaffold contract and build approvals while exempting only FrogBot's lockstep-published package names.

## Reproduction

Run `scaffold()` and inspect the emitted `pnpm-workspace.yaml`; it contains the tree-wide `minimumReleaseAge: 0` setting.

## Current Behavior (our code)

`packages/create-frogbot-app/src/index.ts:32-35` writes one fixed workspace file containing `allowBuilds` for `sharp` and `esbuild` plus `minimumReleaseAge: 0`. `packages/create-frogbot-app/src/index.spec.ts:92-103` pins that broad setting as the expected complete file. `templates/blank/README.md:10-19` and the CLI output at `packages/create-frogbot-app/src/index.ts:61-69` intentionally remain pnpm-specific.

## Root Cause

Ticket 19 restored immediate installs after FrogBot releases with a global opt-out, although only `frogbot` and `@frogbotai/*` require exemption from pnpm's default age gate. The public contract is a zero-step pnpm install with approved native builds and immediate access to current FrogBot packages, not disabling the supply-chain control for unrelated dependencies.

## Source of Truth and Ownership

`scaffold()` is the sole generator of the consuming project's `pnpm-workspace.yaml`. The settings must remain there because pnpm does not read these project settings from dependency packages or `package.json#pnpm`; no second config surface is needed.

## Complete Path Audit

| Path | Reviewed outcome |
|---|---|
| pnpm 10.26+ / 11 install | Workspace file remains; `sharp` and `esbuild` remain approved |
| Install immediately after FrogBot publish | Bare package-name exclusions permit `frogbot` and `@frogbotai/*` without version maintenance |
| Third-party dependency published inside the age window | pnpm's configured/default release-age policy applies instead of being forced to zero |
| npm / yarn / bun | Unchanged; they ignore `pnpm-workspace.yaml` |
| CLI next steps and template README | Unchanged pnpm contract |
| `pnpm create` fetching the CLI | Unchanged; governed before generated project config exists |

## Assumption Audit

- **VERIFIED** - `scaffold()` writes the complete file at `packages/create-frogbot-app/src/index.ts:32-35` and the exact golden assertion is at `packages/create-frogbot-app/src/index.spec.ts:92-103`.
- **VERIFIED** - pnpm documents `minimumReleaseAgeExclude` as accepting package names and patterns: https://pnpm.io/settings#minimumreleaseageexclude.
- **VERIFIED** - `/Users/colbygilbert/Documents/Code/ai/pnpm-workspace.yaml:7-11` uses the durable name-only pattern `@ai-sdk/*` plus `ai` with a nonzero release age.
- **VERIFIED** - `allowBuilds` remains required by the existing pnpm 11 zero-step install contract and is supported in `pnpm-workspace.yaml`: https://pnpm.io/settings/build.
- **DISPROVEN** - name-only exclusions require per-release updates; only version-qualified exclusions carry that maintenance burden.

## Reference Behavior

The AI SDK monorepo applies a nonzero release age globally and excludes only its own scoped and unscoped package names (`/Users/colbygilbert/Documents/Code/ai/pnpm-workspace.yaml:7-11`). This is structurally identical to FrogBot's `@frogbotai/*` and `frogbot` publication model.

## Proposed Fix Direction

Change the fixed YAML emitted by `packages/create-frogbot-app/src/index.ts` to preserve `allowBuilds`, remove `minimumReleaseAge: 0`, and add ordered name-only exclusions for `frogbot` and `'@frogbotai/*'`. Update the existing exact-content regression test first. Do not remove the workspace file, add package-manager detection, alter CLI/README commands, move settings to `package.json`, or use version-qualified exclusions.

## Why Tests Missed It

`packages/create-frogbot-app/src/index.spec.ts:92-103` does not omit the behavior; it codifies the over-broad setting as correct through byte-for-byte equality. The missing class of coverage is a security-scope assertion that distinguishes the required first-party exemption from a global opt-out.

## Regression Tests That Prove the Issue

In `packages/create-frogbot-app/src/index.spec.ts`, change the workspace-content test to expect preserved `allowBuilds`, no `minimumReleaseAge`, and exact name-only `minimumReleaseAgeExclude` entries. Land it with `it.fails` so it proves the current generator is wrong while keeping the stage green; after implementation, restore normal `it` and run the focused spec against the rebuilt packed template.

## Risks / Open Questions

- A future unscoped FrogBot package would require one additional name; the current publication set is fully covered.
- Registry-timing behavior cannot be deterministically reproduced outside a real post-release window, so generated content is the owning test boundary.
- No open design question remains after the reviewed scope ruling.

## Scope Check

In scope: retain `pnpm-workspace.yaml`, retain `allowBuilds`, replace global `minimumReleaseAge: 0` with `frogbot` and `@frogbotai/*` name-only exclusions, and test the generated artifact. Out of scope: package-manager-agnostic CLI redesign, workspace-file removal, CLI/README command changes, package-manager pins, and broader scaffold redesign.

## Sources

- `.idea/issue_triage.md`
- `.idea/tickets/PROCESS.md`
- `.idea/tickets/ticket19_cfa_release_age/*`
- `packages/create-frogbot-app/src/index.ts`
- `packages/create-frogbot-app/src/index.spec.ts`
- `templates/blank/README.md`
- `test/e2e/scaffold.e2e.spec.ts`
- `/Users/colbygilbert/Documents/Code/ai/pnpm-workspace.yaml`
- https://pnpm.io/settings#minimumreleaseageexclude
- https://pnpm.io/settings/build
