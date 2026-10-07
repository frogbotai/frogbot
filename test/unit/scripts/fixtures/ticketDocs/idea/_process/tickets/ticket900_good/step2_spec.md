# Ticket 900 — Good ticket

Status: Approved (2026-10-05)

## Problem

Assets are saved twice ([research](step1_research.md)).

## Rulings

- DR-001 "keep it simple" → Prefer the smallest change. [source](archive/notes.md#L1)

## Requirements

1. Saving an asset writes it once.

## Following Payload

- Saves run in `afterChange` (`~/code/payload/src/config.ts:2`).

## Out of scope

- A migration guide.

## Acceptance criteria

1. `pnpm test:unit test/unit/assets.spec.ts` passes.

## Decisions

### 900 D1 — Save on create or on update?

- **Situation.** An asset is written on create and again on update.
- **Example.**
  ```ts
  await saveAsset(doc);
  ```
- **Payload does:** saves in `afterChange` (`~/code/payload/src/config.ts:2`).
- **Options.** **A.** On create. **B.** On update.
- **Recommendation:** A, because it is simpler.
- **Applies to:** Process
- Reply: `900 D1: A` or `B`
- **Answer:** A — owner, 2026-10-05
