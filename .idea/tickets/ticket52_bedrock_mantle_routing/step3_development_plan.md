# Step 3: Development Plan

**Branch:** `fix/bedrock-mantle-routing`

## Stage 1: Regression Proof

- Goal: encode the metadata-loss and wrong-provider mechanisms before fixing them.
- Dependencies: existing catalog builder and Bedrock provider test harness.
- Expected changes: add failing catalog-sync coverage for `provider` to `sdk` preservation; add failing Bedrock model-dispatch coverage for Responses, Chat, base URL interpolation, credential reuse, and standard fallback.
- Verification: run focused specs and confirm only the new `it.fails` cases fail without their markers.
- Risks/open questions: use mocked SDK factories; no live AWS dependency.
- Contract: `buildCatalogs`, `ModelCatalogEntry`, and `bedrockProvider.build`.

## Stage 2: Preserve Catalog Routing Metadata

- Goal: carry models.dev routing facts into the gateway's authoritative catalog.
- Dependencies: Stage 1.
- Expected changes: add optional `sdk` metadata to `ModelCatalogEntry`; map `model.provider`; regenerate the gateway catalog while leaving FrogBot's flattened type catalog shape unchanged; activate catalog assertions.
- Verification: run the catalog regression spec and gateway catalog specs.
- Risks/open questions: inspect generated changes to exclude unrelated upstream model churn.
- Contract: catalog sync output and `ModelCatalogEntry`.

## Stage 3: Dispatch Mantle Models at the Bedrock Boundary

- Goal: make every existing Bedrock consumer receive the correct AI SDK language model.
- Dependencies: Stage 2.
- Expected changes: compose standard and lazily cached Mantle providers inside `bedrockProvider.build`; interpolate `${AWS_REGION}` in catalogued API URLs; dispatch by `sdk.shape`; activate provider regression tests; record the implementation summary.
- Verification: run focused Bedrock and catalog tests, the gateway test suite, full `pnpm test`, rebuild workspace `dist`, then run non-live e2e coverage; report credential-gated live AWS coverage as skipped.
- Risks/open questions: custom catalog overrides remain outside the current provider build contract and are not expanded in this ticket.
- Contract: `bedrockProvider.build`; route and in-process call sites remain unchanged.
