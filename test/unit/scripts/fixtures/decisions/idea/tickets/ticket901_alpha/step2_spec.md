# Ticket 901 — Alpha

Status: Draft

## Problem

Alpha is slow.

## Following Payload

The owner can veto any of these.

- Fields keep their order (`~/code/payload/packages/payload/src/fields/config/types.ts:10`).

## Decisions

### 901 D1 — Should alpha keep the old flag?

- **Situation.** The old flag still exists.
- **Example.**
  ```ts
  alpha({ old: true });
  ```
- **Payload does:** no equivalent (searched alpha).
- **Options.** **A.** Remove it, simpler. **B.** Keep it, no break.
- **Recommendation:** A, because breaking changes are fine.
- **Applies to:** `Process`
- Reply: `901 D1: A` or `B`
- **Answer:**

### 901 D2 — Which colour?

- **Situation.** Two colours.
- **Options.** **A.** Green. **B.** Blue.
- **Recommendation:** A.
- **Applies to:** this ticket
- Reply: `901 D2: A` or `B`
- **Answer:**
