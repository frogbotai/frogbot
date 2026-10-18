# Vendored: Payload importMap generator

Vendored from the Payload monorepo — `packages/payload/src/cli/commands/generateImportMap/`.

- Upstream: https://github.com/payloadcms/payload
- Path: `packages/payload/src/cli/commands/generateImportMap`
- Commit: `73d3dd897381a851ff1708bbde19444d1a0c5b43`
- Tag: `v4.0.0-beta.2`

Vendored because these internals are not exported from `payload`, and FrogBot owns
the emitted `importMap.js` (branding rule: no Payload references in generated files).
Public pieces are NOT vendored — `genImportMapIterateFields` is imported from
`payload`, `parsePayloadComponent` from `payload/shared`.

## Files

| Local                                         | Upstream                                      |
| --------------------------------------------- | --------------------------------------------- |
| `index.ts`                                    | `generateImportMap.ts`                        |
| `frameworkConventions.ts`                     | `frameworkConventions.ts`                     |
| `iterateConfig.ts`                            | `iterateConfig.ts`                            |
| `iterateCollections.ts`                       | `iterateCollections.ts`                       |
| `iterateGlobals.ts`                           | `iterateGlobals.ts`                           |
| `utilities/addPayloadComponentToImportMap.ts` | `utilities/addPayloadComponentToImportMap.ts` |
| `utilities/getImportMapToBaseDirPath.ts`      | `utilities/getImportMapToBaseDirPath.ts`      |
| `utilities/resolveImportMapFilePath.ts`       | `utilities/resolveImportMapFilePath.ts`       |

## Local modifications

- Emitted file header is `/** @type import('frogbot').ImportMap */` (was `import('payload')`).
- `resolveImportMapFilePath` defaults to the `app/(frogbot)` / `src/app/(frogbot)` route
  group (was `(payload)`); error messages de-branded.
- `frameworkConventions.ts` holds only the `(frogbot)` route group: FrogBot has no TanStack
  Start host (`_payload`).
- `generateImportMap` returns `{ changed, outputPath } | null` (upstream
  `{ outputFile, written }`) instead of logging; `log` option removed (CLI does the messaging). `ignoreResolveError` returns `null`.
- `iterateConfig` receives the resolved `baseDir` (upstream passes the possibly-undefined
  `config.admin.importMap.baseDir`).
- `iterateCollections` casts custom views structurally instead of importing the
  non-exported `AdminViewConfig` type.
- Comments stripped; house code style (semicolons, node: import specifiers).

Run `pnpm vendored`, port what it lists, then update `Commit:` and `Tag:`.
