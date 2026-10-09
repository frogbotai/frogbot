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
- `packages/ui/src/chat/provider-logos.ts`

`scripts/sync-catalog.mjs` contains the pinned field transformations and provider
aliases. Models marked `deprecated` by models.dev are excluded.

models.dev `google-vertex` syncs as `vertex` and keeps only the models served by
`@ai-sdk/google-vertex` (Gemini) or `@ai-sdk/google-vertex/anthropic` (Claude):
a model's `provider.npm`, or the provider's `npm` when the model has none. Its
Model-as-a-Service and partner models (`@ai-sdk/openai-compatible`) are dropped.

Catalogs are sorted by model ID; provider logos are sorted by FrogBot provider
slug and formatted with Prettier. A second `pnpm sync:catalog` against
the same source data must leave the worktree unchanged.

Provider logos come from `https://models.dev/logos/<provider>.svg` for synced
providers present in the source dataset. They are downloaded only during the
sync and bundled as SVG path data; the chat UI makes no runtime logo requests.
The sync retains each logo's viewBox and only path attributes `d`, `fill`,
`fill-rule`, `clip-rule`, and `opacity`. Other attributes are dropped. Unsupported
elements, missing viewBox or path data, network failures, and HTTP errors other
than 404 fail the sync before any generated file is written. A provider 404 or a
response identical to the known-missing probe's generic logo is omitted, so the
UI can use its fallback icon. A 404 on the probe is also accepted.

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
