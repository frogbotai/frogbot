# Ticket 49 - Step 1: Solution Assessment

**Issue:** #44 | **Branch:** `chore/cfa-scoped-release-age` | **Research:** `./research.md`

## Problem

The scaffold disables pnpm's release-age protection for every dependency to keep newly published FrogBot packages immediately installable.

## Options

**Option A - remove `pnpm-workspace.yaml` and redesign for all package managers**
- Pros: no pnpm-specific generated artifact.
- Cons: removes required pnpm 11 build approvals and expands into CLI detection, commands, and documentation outside reviewed scope.

**Option B - keep the file and replace the global opt-out with name-only FrogBot exclusions**
- Pros: preserves zero-step pnpm installs and `allowBuilds`; restores release-age protection for third-party packages; no per-release maintenance.
- Cons: a future FrogBot package outside the current scope/name pair needs another entry.

**Option C - use version-qualified FrogBot exclusions**
- Pros: narrowly identifies current releases.
- Cons: stale after every release and requires generator maintenance.

## Recommendation

**Option B.** It is the smallest change that preserves the existing pnpm contract while narrowing the security exemption to `frogbot` and `@frogbotai/*`.
