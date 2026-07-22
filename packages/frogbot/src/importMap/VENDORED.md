# Vendored: Payload importMap generator

Vendored from the Payload monorepo — `packages/payload/src/bin/generateImportMap/`.

- Source: https://github.com/payloadcms/payload
- Tag: `v3.85.1`
- Commit: `a8c8da8df42f37ffc6a6b647ef9d3c8116a4717a`

Vendored because these internals are not exported from `payload`, and FrogBot owns
the emitted `importMap.js` (branding rule: no Payload references in generated files).
Public pieces are NOT vendored — `genImportMapIterateFields` is imported from
`payload`, `parsePayloadComponent` from `payload/shared`.

## Files

| Local | Upstream |
| --- | --- |
| `index.ts` | `index.ts` (`generateImportMap`, `writeImportMap`) |
| `iterateConfig.ts` | `iterateConfig.ts` |
| `iterateCollections.ts` | `iterateCollections.ts` |
| `iterateGlobals.ts` | `iterateGlobals.ts` |
| `utilities/addPayloadComponentToImportMap.ts` | `utilities/addPayloadComponentToImportMap.ts` |
| `utilities/getImportMapToBaseDirPath.ts` | `utilities/getImportMapToBaseDirPath.ts` |
| `utilities/resolveImportMapFilePath.ts` | `utilities/resolveImportMapFilePath.ts` |

## Local modifications

- Emitted file header is `/** @type import('frogbot').ImportMap */` (was `import('payload')`).
- `resolveImportMapFilePath` defaults to the `app/(frogbot)` / `src/app/(frogbot)` route
  group (was `(payload)`); error messages de-branded.
- `generateImportMap` returns `{ changed, outputPath } | null` instead of logging;
  `log` option removed (CLI does the messaging). `ignoreResolveError` returns `null`.
- `iterateConfig` receives the resolved `baseDir` (upstream passes the possibly-undefined
  `config.admin.importMap.baseDir`).
- `iterateCollections` casts custom views structurally instead of importing the
  non-exported `AdminViewConfig` type.
- `iterateConfig` casts `dashboardWidget.fields as Field[]` — Payload's published
  `.d.ts` expansion of `Omit<Widget, 'Component'>` fails structural assignability
  against `Field[]` when compiled from outside the Payload monorepo.
- Comments stripped; house code style (semicolons, node: import specifiers).

When bumping Payload, diff these files against the new tag before updating.
