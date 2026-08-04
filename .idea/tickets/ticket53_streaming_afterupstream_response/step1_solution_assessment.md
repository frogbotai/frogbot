# Step 1: Solution Assessment

## Problem

Streaming language routes omit the assembled response from `afterUpstream`, unlike their non-streaming equivalents.

## Option A: Fix each route handler

- Pros: Keeps each wire format explicit.
- Cons: Duplicates the same lifecycle behavior across three handlers and can drift again.

## Option B: Fix the shared stream lifecycle

- Pros: Restores the invariant once for every streaming language route at the owning boundary.
- Pros: Reuses the existing hook contract and AI SDK completion event without new API surface.
- Cons: Requires regression coverage proving the shared change reaches an HTTP route.

## Recommendation

Choose Option B. `createStreamLifecycle` owns all three affected streaming paths and already receives the assembled response in its completion event.
