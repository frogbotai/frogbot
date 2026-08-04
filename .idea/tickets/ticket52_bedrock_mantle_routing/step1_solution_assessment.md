# Step 1: Solution Assessment

## Problem

FrogBot advertises Bedrock Mantle-only models but drops their routing metadata and sends them through the standard Bedrock runtime, where AWS rejects them.

## Option A: Route in each handler

- Pros: each route can choose an AI SDK method directly.
- Cons: duplicates Bedrock-specific logic across HTTP and in-process consumers; leaves future call sites unsafe.

## Option B: Register a separate Mantle provider

- Pros: maps directly to the separate AI SDK export.
- Cons: breaks existing `amazon-bedrock/*` model IDs and duplicates provider configuration and allowlists.

## Option C: Preserve catalog metadata and dispatch inside Bedrock

- Pros: keeps models.dev as the routing source of truth; preserves public IDs; fixes every existing consumer at one provider-owned boundary.
- Cons: the current provider build contract limits dispatch to the shipped catalog rather than caller-supplied catalog overrides.

## Recommendation

Choose Option C. Preserve `npm`, `api`, and `shape` as optional catalog SDK metadata, then make the Bedrock provider's `languageModel` select standard Bedrock or Mantle from that metadata.
