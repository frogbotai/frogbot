# Model catalog refresh

The committed FrogBot and gateway model catalogs are generated from the current
`https://models.dev/api.json` dataset by a maintainer. Application startup and
user type generation never fetch model metadata.

`pnpm bump` runs `pnpm sync:catalog` first, so every release ships a fresh
catalog and its build and tests run against it. To refresh between releases, run
`pnpm sync:catalog` directly. Either way, review the provider and model changes
and commit these artifacts together:

- `packages/frogbot/src/ai/catalog.json`
- `packages/frogbot/src/ai/generated.ts`
- `packages/gateway/src/providers/catalog.data.ts`

`scripts/sync-catalog.mjs` contains the pinned field transformations and provider
aliases. Models marked `deprecated` by models.dev are excluded.

The generated files are sorted by model ID. A second `pnpm sync:catalog` against
the same source data must leave the worktree unchanged.

## Reviewed overlays

`scripts/model-catalog-overlays.json` is keyed by FrogBot provider ID. Each provider
may define optional `exclude`, `correct`, and `add` arrays. Sync applies them in
that order after mapping and filtering upstream models:

- `exclude`: remove upstream entries using provider-relative model IDs.
- `correct`: fix models.dev errors or apply reviewed extensions to existing
  entries. Each object uses the full FrogBot model ID, such as
  `openai/text-embedding-3-small`, and only the gateway fields being replaced.
- `add`: supply complete gateway entries for models missing from models.dev.
  Voyage uses this mechanism because models.dev does not currently provide it.
  Replicate is reserved as an overlay-only provider but has no entries until
  reviewed metadata is available.

Corrections shallowly merge into the mapped gateway entry. Omitted top-level
fields retain their upstream metadata; a supplied object or array replaces the
whole field rather than merging its contents. For example, `capabilities: {}`
removes all mapped capabilities. Supply both `input` and `output` when replacing
`modalities`, and the complete operation list when replacing `operations`.

Never supply `mode` in `correct`. Sync computes FrogBot's mode from the final
modalities and operations; any legacy `mode` in `add` is ignored. To correct an
embedding model reported as text output, replace `modalities` with text input and
embedding output and replace `operations` with `["embeddings"]`; do not add a
duplicate model or set its mode.
Text-and-audio input with text output remains a chat model.

## Stale overlays and review warnings

Sync fails rather than silently ignoring stale or invalid overlays. Review and
update or drop the affected entries when:

- A correction targets a missing, renamed, deprecated, or filtered-out model.
- An exclusion no longer matches an upstream model ID.
- A correction's full model ID has a provider prefix different from its overlay
  provider.
- A correction's ID is also listed in `add` or `exclude` for that provider.
- A correction supplies `mode` or an unknown gateway field.

Use `correct` for an existing upstream model, not `add`. If models.dev fixes an
error, review whether the correction can be dropped. If an upstream ID changes,
update the reviewed correction or exclusion to the new ID; do not retain a stale
entry to hide the change.

A model whose ID or models.dev family contains `embed` (case-insensitive) and
still maps to chat without a correction emits a review warning. The warning does
not change its metadata or mode. Confirm the model's behavior before adding a
correction; the name alone is not evidence that it supports embeddings.
