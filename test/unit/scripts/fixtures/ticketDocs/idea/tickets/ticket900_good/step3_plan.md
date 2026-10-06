# Plan: Ticket 900 — Good ticket

Status: Go (2026-10-05)

touches:

- src/example.ts

## Approach

Save once in `saveAsset` (`src/example.ts:1`). FrogBot-specific.

> Owner: "no release notes for this".

## Alternatives

- Save twice: wasteful.

## Stages

1. Save once.
   - Verify: `pnpm test:unit test/unit/assets.spec.ts`
   - Evidence: unit
