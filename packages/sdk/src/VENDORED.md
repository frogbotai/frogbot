# Vendored: Payload SDK

Ported from the Payload monorepo — `packages/sdk/src/`.

- Source: https://github.com/payloadcms/payload
- Version: `@payloadcms/sdk` `3.90.1` (the npm tarball, matching the installed `payload`)
- License: MIT, reproduced in [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)

Ported so the SDK ships one FrogBot client whose requests match Payload's REST client byte for byte.
`test/unit/sdk/` compares every ported method against the published `@payloadcms/sdk`.

## Files

| Local                                     | Upstream                                          |
| ----------------------------------------- | ------------------------------------------------- |
| `types.ts`                                | `types.ts`                                        |
| `utilities/buildSearchParams.ts`          | `utilities/buildSearchParams.ts`                  |
| `utilities/resolveFileFromOptions.ts`     | `utilities/resolveFileFromOptions.ts`             |
| `collections/count.ts`                    | `collections/count.ts`                            |
| `collections/create.ts`                   | `collections/create.ts`                           |
| `collections/delete.ts`                   | `collections/delete.ts`                           |
| `collections/find.ts`                     | `collections/find.ts`                             |
| `collections/findByID.ts`                 | `collections/findByID.ts`                         |
| `collections/findVersionByID.ts`          | `collections/findVersionByID.ts`                  |
| `collections/findVersions.ts`             | `collections/findVersions.ts`                     |
| `collections/restoreVersion.ts`           | `collections/restoreVersion.ts`                   |
| `collections/update.ts`                   | `collections/update.ts`                           |
| `auth/forgotPassword.ts`                  | `auth/forgotPassword.ts`                          |
| `auth/login.ts`                           | `auth/login.ts`                                   |
| `auth/me.ts`                              | `auth/me.ts`                                      |
| `auth/refreshToken.ts`                    | `auth/refreshToken.ts`                            |
| `auth/resetPassword.ts`                   | `auth/resetPassword.ts`                           |
| `auth/verifyEmail.ts`                     | `auth/verifyEmail.ts`                             |
| `index.ts` (`#send` and the data methods) | `index.ts` (`PayloadSDK.request` and its methods) |

`search.ts` is FrogBot's own; it has no upstream.

## Local modifications

- Globals are not ported; FrogBot has no globals.
- Shared types (`Where`, `Sort`, `SelectType`, `PaginatedDocs`, `TypeWithVersion`, `ApplyDisableErrors`,
  `JsonObject`, `TransformDataWithSelect`, `TypeWithID`) are imported type-only from `frogbot`.
  The slug helpers (`CollectionSlug<T>`, `AuthCollectionSlug<T>`, `UploadCollectionSlug<T>`, `TypedLocale<T>`)
  are local and keyed by the SDK's `T`.
- `FrogBotSDK<T>` defaults `T` to `frogbot`'s `GeneratedTypes`, and to an untyped shape until types are generated.
- `where` on collection operations is `WhereFromCollectionSlug`: the collection's top-level field names
  (for autocomplete) intersected with `Where`.
- `DeepPartial` is a local type instead of `ts-essentials`.
- Operations receive the client's private `#send` instead of the client. `#send` builds on the existing
  `request()`, so `FrogBotSDKError`, base headers, and per-request header merging apply to every method.
- `PayloadSDKError` is replaced by the existing `FrogBotSDKError`.
- JSDoc rewritten in FrogBot wording; comments stripped; house code style (semicolons).

When bumping Payload, diff these files against the new `@payloadcms/sdk` release before updating.
