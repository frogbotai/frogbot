# Step 1: Solution Assessment

## Problem

Add code-defined RBAC with runtime role assignment while preserving Payload's native collection, field, and agent access contracts.

## Option A: Force relationship population

- Pros: Grant checks are synchronous, use normal Payload relationship behavior, and avoid per-access queries.
- Cons: Raising auth depth also populates unrelated auth relationships.

## Option B: Resolve role IDs inside every access function

- Pros: Does not alter auth depth and accepts unpopulated relationships.
- Cons: Adds request-time queries, caching complexity, and failure modes during permission computation.

## Option C: Store grant snapshots on users

- Pros: No relationship population or role lookup is needed.
- Cons: Duplicates code-defined policy, requires synchronization, and makes stale authorization data possible.

## Recommendation

Use Option A. Synchronize a read-only roles projection from code, force auth depth to at least one, and let one grant lookup core consume populated roles through distinct `can()` and `canAgent()` adapters. Preserve higher user-configured depth values.
