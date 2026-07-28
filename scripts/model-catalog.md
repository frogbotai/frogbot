# Model catalog refresh

The committed FrogBot and gateway model catalogs are generated from the current
`https://models.dev/api.json` dataset by a maintainer. Application startup and
user type generation never fetch model metadata.

Run `pnpm sync:catalog`, review the provider and model changes, and commit these
artifacts together:

- `packages/frogbot/src/ai/catalog.json`
- `packages/frogbot/src/ai/generated.ts`
- `packages/gateway/src/providers/catalog.data.ts`

`scripts/sync-catalog.mjs` contains the pinned field transformations and provider
aliases. Models marked `deprecated` by models.dev are excluded. Voyage models,
which models.dev does not currently provide, are reviewed in
`scripts/model-catalog-overlays.json`. Replicate is reserved as an overlay-only
provider but has no catalog entries until reviewed metadata is available.

The generated files are sorted by model ID. A second `pnpm sync:catalog` against
the same source data must leave the worktree unchanged.
