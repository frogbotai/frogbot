# Step 2: Feature Description

## Problem

The model catalog and Bedrock runtime disagree about which AWS endpoint serves Mantle-only models. Catalogued and allowlisted models therefore fail despite valid AWS credentials.

## User Stories

- As a Bedrock user, I want catalogued Mantle models to route transparently so that configured models are usable.
- As an operator, I want model routing derived from the synchronized catalog so that new Mantle models do not require route patches.
- As a maintainer, I want standard Bedrock models to retain their current behavior.

## Core Requirements

- Preserve models.dev per-model `npm`, `api`, and `shape` metadata in the gateway catalog.
- Route Mantle entries through `@ai-sdk/amazon-bedrock/mantle` with the catalogued region-specific base URL.
- Select `.responses()` or `.chat()` from catalog shape while preserving standard `.languageModel()` routing for other Bedrock models.
- Reuse bearer, explicit SigV4, and default credential-chain settings.
- Cover the pre-fix metadata loss and standard-runtime misrouting with regression tests before implementation.

## Shared Component Inventory

- `scripts/sync-catalog.mjs`: extend the canonical catalog synchronization path.
- `ModelCatalogEntry`: extend the existing gateway catalog contract; no parallel routing registry.
- `bedrockProvider`: extend the canonical provider boundary; no HTTP route or in-process gateway changes.
- FrogBot's flattened type catalog remains unchanged because it owns ID/type membership, not runtime routing.

## User Flow

1. A maintainer synchronizes models.dev into the committed gateway catalog.
2. A user configures and requests an `amazon-bedrock/*` model normally.
3. Bedrock dispatch reads the model's synchronized SDK metadata.
4. Standard models use Bedrock Runtime; Mantle models use the specified Mantle API and shape.

## Success Criteria

- All eight currently catalogued Mantle-only models retain routing metadata.
- A Responses-shaped Mantle model uses the interpolated `/openai/v1` or `/v1` base URL and `.responses()`.
- A Chat-shaped Mantle fixture uses `.chat()`.
- Standard Bedrock models and all existing credential modes remain unchanged.
- Focused gateway tests and the full non-live suite pass.
