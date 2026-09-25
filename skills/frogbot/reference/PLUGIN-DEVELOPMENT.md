# Plugin Development

Docs: https://docs.frogbot.ai/plugins/build-your-own

A FrogBot plugin receives the current `FrogBotConfig` and returns the next config, synchronously or asynchronously. Export a factory when the plugin accepts options. This introductory skeleton returns the config unchanged; the collection example below implements the option.

```ts
import type { FrogBotConfig, Plugin } from 'frogbot';

export type NotesPluginOptions = {
  collectionSlug?: string;
};

export function notesPlugin(_options: NotesPluginOptions = {}): Plugin {
  return (config: FrogBotConfig) => {
    return config;
  };
}
```

Validate option shapes in the factory when possible. Validate conflicts that depend on the application config inside the returned plugin.

## Package Structure

Keep a small plugin in one entry file. Split code only when a domain or export boundary needs it.

```text
packages/plugins/plugin-notes/
├── package.json
├── README.md
├── tsconfig.json
└── src/
    ├── index.ts
    ├── collection.ts
    ├── types.ts
    ├── client.ts
    └── client/
        ├── NotesPanel.tsx
        └── styles.css
```

- `src/index.ts` is the server-safe public entry. Export the factory, option types, and server utilities here.
- `src/client.ts` is the browser entry. It re-exports client components from `src/client/`.
- `src/collection.ts` owns generated collection configuration when that configuration is substantial.
- `src/types.ts` owns shared public types when keeping them beside the factory would make the entry hard to read.
- CSS and other runtime assets must be copied to the corresponding location under `dist` by the build script.
- Tests and test applications belong under the repository root `test/`, not in the package source tree.

Do not create empty `exports/`, `server/`, `components/`, or `translations/` directories. Add structure only for code the plugin has.

## Package Exports

Use an ESM package with declarations and explicit export maps. A plugin without browser code needs only the root entry. A plugin with admin UI adds `./client`.

```json
{
  "name": "@frogbotai/plugin-notes",
  "version": "0.24.0",
  "description": "Notes for FrogBot collections.",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./client": {
      "types": "./dist/client.d.ts",
      "import": "./dist/client.js",
      "default": "./dist/client.js"
    }
  },
  "files": ["dist"],
  "sideEffects": ["*.css"],
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && mkdir -p dist/client && cp src/client/styles.css dist/client/styles.css",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "@frogbotai/ui": "workspace:*",
    "frogbot": "workspace:*",
    "react": "^19.0.1 || ^19.1.2 || ^19.2.1",
    "react-dom": "^19.0.1 || ^19.1.2 || ^19.2.1"
  },
  "devDependencies": {
    "@frogbotai/ui": "workspace:*",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "frogbot": "workspace:*",
    "react": "^19.0.1 || ^19.1.2 || ^19.2.1",
    "react-dom": "^19.0.1 || ^19.1.2 || ^19.2.1",
    "typescript": "5.6.2"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

The `types`, `import`, and `default` conditions all point to built files. Put `types` first in each conditional entry so TypeScript resolves declarations before a runtime condition. Do not expose source files or undeclared deep imports. This manifest is for a first-party workspace; pnpm rewrites `workspace:*` on packing. An independently maintained plugin uses its own package name and supported FrogBot version ranges.

List a package as a peer dependency when the consuming app must provide the runtime instance. Add the same package to `devDependencies` when this workspace needs it to build or test. Omit React and `@frogbotai/ui` entirely from a server-only plugin.

If the package has no CSS, omit `sideEffects` and the copy command. If it has several asset types, extend the build command only for assets that actually exist.

## Client And Server Boundaries

The root entry must remain safe to import while loading `frogbot.config.ts`. Never re-export a client component from `src/index.ts`, and never import `src/client.ts` from server code.

In `src/client.ts`:

```ts
export { NotesPanel } from './client/NotesPanel.js';
```

In `src/client/NotesPanel.tsx`, with the package's CSS at `src/client/styles.css`:

```tsx
'use client';

import './styles.css';

import { useConfig } from '@frogbotai/ui';

export function NotesPanel() {
  const { config } = useConfig();

  return <p className="plugin-notes-panel">Notes API: {config.routes.api}/notes</p>;
}
```

Reference the public client subpath from configuration. The part after `#` must match a named export.

```ts
export const NOTES_PANEL = '@frogbotai/plugin-notes/client#NotesPanel';
```

Server components and server utilities stay in server-safe modules and may be exported from the package root. Create another public subpath only when consumers need a stable, distinct import boundary; mirror it in `exports` and ensure its entire dependency graph is server-safe.

Within one client graph, import runtime UI APIs consistently from `@frogbotai/ui`. Use `import type` for server-owned types so they cannot pull server code into the browser bundle.

## Build Configuration

First-party plugins extend the repository TypeScript configuration and emit JavaScript, declarations, declaration maps, and source maps into `dist`.

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/**/*.spec.ts"]
}
```

Use `.js` extensions for relative imports in TypeScript source because the emitted package is ESM.

```ts
export type { NotesPluginOptions } from './types.js';
export { createNotesCollection } from './collection.js';
```

Build from the repository root with:

```bash
pnpm --filter @frogbotai/plugin-notes build
```

The build must produce every path named by `main`, `types`, and `exports`. Inspect the packed output before publishing when export maps or copied assets change.

## Adding A Collection

Construct defaults first, apply documented user overrides deliberately, and reject slug collisions unless merging an existing collection is an explicit feature.

```ts
import type { CollectionConfig, Plugin } from 'frogbot';

export type NotesPluginOptions = {
  collection?: Partial<Omit<CollectionConfig, 'slug'>>;
  collectionSlug?: string;
};

export function createNotesCollection(options: NotesPluginOptions = {}): CollectionConfig {
  const collectionSlug = options.collectionSlug ?? 'notes';

  if (!collectionSlug) {
    throw new Error('[plugin-notes] collectionSlug is required.');
  }

  return {
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'body', type: 'textarea' },
    ],
    ...options.collection,
    slug: collectionSlug,
  };
}

export function notesPlugin(options: NotesPluginOptions = {}): Plugin {
  const notes = createNotesCollection(options);

  return (config) => {
    if (config.collections.some(({ slug }) => slug === notes.slug)) {
      throw new Error(`[plugin-notes] Collection slug '${notes.slug}' already exists.`);
    }

    return {
      ...config,
      collections: [...config.collections, notes],
    };
  };
}
```

The slug is fixed after overrides so the collision check covers the collection actually added. This example deliberately lets `collection.fields` replace all default fields. For the split package layout above, move `NotesPluginOptions` to `src/types.ts` and `createNotesCollection` to `src/collection.ts`, importing them into `src/index.ts`.

## Adding Fields

Map collections and return unmatched entries unchanged. Check field names before adding fields generated by the plugin.

```ts
import type { Field, Plugin } from 'frogbot';

type NotesFieldsOptions = {
  collections: string[];
  fields?: (args: { defaultFields: Field[] }) => Field[];
};

export function notesFieldsPlugin(options: NotesFieldsOptions): Plugin {
  return (config) => {
    const defaultFields: Field[] = [{ name: 'internalNotes', type: 'textarea' }];
    const fields = options.fields?.({ defaultFields }) ?? defaultFields;

    return {
      ...config,
      collections: config.collections.map((collection) => {
        if (!options.collections.includes(collection.slug)) {
          return collection;
        }

        const existingNames = new Set(
          collection.fields.flatMap((field) => ('name' in field ? [field.name] : [])),
        );

        const collision = fields.find((field) => 'name' in field && existingNames.has(field.name));

        if (collision && 'name' in collision) {
          throw new Error(
            `[plugin-notes] Field '${collision.name}' already exists on '${collection.slug}'.`,
          );
        }

        return {
          ...collection,
          fields: [...collection.fields, ...fields],
        };
      }),
    };
  };
}
```

Passing defaults through a callback lets consumers append, remove, or replace fields without the plugin guessing how overrides should merge. This example checks direct field-name collisions; recurse through unnamed layout fields if your plugin injects into collections containing rows, collapsibles, or unnamed tabs.

## Field Components

A field component has two parts: server-side field configuration and a client export.

In `src/fields/noteStatus.ts`:

```ts
import type { TextField } from 'frogbot';

type NoteStatusOverrides = Partial<
  Omit<Extract<TextField, { hasMany?: false }>, 'hasMany' | 'type'>
>;

export function noteStatusField(overrides: NoteStatusOverrides = {}): TextField {
  return {
    name: 'noteStatus',
    admin: {
      components: {
        Field: '@frogbotai/plugin-notes/client#NoteStatusField',
      },
    },
    ...overrides,
    hasMany: false,
    type: 'text',
  };
}
```

In `src/client/NoteStatusField.tsx`:

```tsx
'use client';

import { FieldLabel, useField } from '@frogbotai/ui';
import type { TextFieldClientComponent } from 'frogbot';
import { useId } from 'react';

export const NoteStatusField: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const inputId = useId();
  const { setValue, value } = useField<string>({ path });

  return (
    <div>
      <FieldLabel
        htmlFor={inputId}
        label={field.label ?? 'Note status'}
        path={path}
        required={field.required}
      />
      <input
        id={inputId}
        name={path}
        onChange={(event) => setValue(event.target.value)}
        readOnly={readOnly}
        value={value ?? ''}
      />
    </div>
  );
};
```

Add the export to `src/client.ts`:

```ts
export { NoteStatusField } from './client/NoteStatusField.js';
```

This factory keeps a single-value text field while allowing `name` and `admin` replacement. Use narrower options if the component reference must also remain fixed. Render these components through FrogBot's admin slots and field renderer, which supply config, form, translation, and locale providers.

## Admin Components

Admin component references are strings or component descriptors in configuration. Preserve the surrounding `admin` and `components` objects, and preserve existing arrays in the intended order. Root `beforeNavLinks` renders above the sidebar navigation links; this example appends the panel after existing components in that slot.

```ts
import type { Plugin } from 'frogbot';

export const notesNavigationPlugin: Plugin = (config) => ({
  ...config,
  admin: {
    ...config.admin,
    components: {
      ...config.admin?.components,
      beforeNavLinks: [
        ...(config.admin?.components?.beforeNavLinks ?? []),
        '@frogbotai/plugin-notes/client#NotesPanel',
      ],
    },
  },
});
```

Collection list slots live on `admin.views` entries with `type: 'list'`. Prepend the panel to each list view's `components.beforeTable`, preserving other views, view options, and collection admin components. When `admin.views` is omitted, FrogBot defaults to one list view; make that default explicit before adding the slot. An explicit view array without a list view is preserved.

```ts
import type { CollectionView, Plugin } from 'frogbot';

export const notesListPlugin: Plugin = (config) => {
  const collections = config.collections.map((collection) => {
    if (collection.slug !== 'notes') {
      return collection;
    }

    const views: CollectionView[] = collection.admin?.views ?? [{ type: 'list' }];

    return {
      ...collection,
      admin: {
        ...collection.admin,
        views: views.map((view) => {
          if (view.type !== 'list') {
            return view;
          }

          return {
            ...view,
            components: {
              ...view.components,
              beforeTable: [
                '@frogbotai/plugin-notes/client#NotesPanel',
                ...(view.components?.beforeTable ?? []),
              ],
            },
          };
        }),
      },
    };
  });

  return { ...config, collections };
};
```

Prepending versus appending changes visual and execution order. Choose it intentionally and test with another configured component already present.

## Translations

Namespace translation keys with the plugin name so they cannot collide with application keys. The lookup `plugin-notes:addNote` needs a nested `plugin-notes` dictionary. Merge both locales and that dictionary independently, letting application keys win.

```ts
import type { Plugin } from 'frogbot';

export const pluginTranslations = {
  en: {
    'plugin-notes': {
      addNote: 'Add note',
      empty: 'No notes yet',
    },
  },
  es: {
    'plugin-notes': {
      addNote: 'Agregar nota',
      empty: 'Todavía no hay notas',
    },
  },
};

export const notesTranslationsPlugin: Plugin = (config) => {
  const translations = { ...config.i18n?.translations };
  const locales: (keyof typeof pluginTranslations)[] = ['en', 'es'];

  for (const locale of locales) {
    const existing = translations[locale];
    const namespace = existing && 'plugin-notes' in existing ? existing['plugin-notes'] : undefined;

    translations[locale] = {
      ...existing,
      'plugin-notes': {
        ...pluginTranslations[locale]['plugin-notes'],
        ...(typeof namespace === 'object' && namespace !== null ? namespace : {}),
      },
    };
  }

  return {
    ...config,
    i18n: {
      ...config.i18n,
      translations,
    },
  };
};
```

Other application locales and namespaces are preserved. These defaults have flat string keys within the plugin namespace; nested dictionaries need another merge level. Adding translations does not enable an admin language: the app still configures `i18n.supportedLanguages`. If the plugin has many locales, put its dictionaries in `src/translations/` and import them into the server-safe plugin entry.

## Endpoints, Hooks, Jobs, And Initialization

Preserve existing root configuration while adding each feature. Pass real endpoint, `afterError` hook, and task definitions to this composition helper.

```ts
import type { AfterErrorHook, Endpoint, FrogBotConfig, Plugin } from 'frogbot';

type NotesFeaturesOptions = {
  afterError: AfterErrorHook;
  endpoint: Endpoint;
  task: NonNullable<NonNullable<FrogBotConfig['jobs']>['tasks']>[number];
};

export function notesFeaturesPlugin({ afterError, endpoint, task }: NotesFeaturesOptions): Plugin {
  return (config) => ({
    ...config,
    endpoints: [...(config.endpoints ?? []), endpoint],
    hooks: {
      ...config.hooks,
      afterError: [...(config.hooks?.afterError ?? []), afterError],
    },
    jobs: {
      ...config.jobs,
      tasks: [...(config.jobs?.tasks ?? []), task],
    },
  });
}
```

Collection hooks require the same nested composition:

```ts
import type { AfterChangeHook, CollectionConfig } from 'frogbot';

export function withNotesAfterChange({
  collection,
  notesAfterChange,
}: {
  collection: CollectionConfig;
  notesAfterChange: AfterChangeHook;
}): CollectionConfig {
  return {
    ...collection,
    hooks: {
      ...collection.hooks,
      afterChange: [notesAfterChange, ...(collection.hooks?.afterChange ?? [])],
    },
  };
}
```

Hook order is behavior. Prepend when the plugin must run before application hooks; append when it must observe their result.

`onInit` accepts one handler or an array. Normalize it before appending instead of replacing application initialization.

```ts
import type { OnInit, Plugin } from 'frogbot';

export function notesInitPlugin(initializeNotes: OnInit): Plugin {
  return (config) => {
    const onInit =
      config.onInit === undefined
        ? []
        : Array.isArray(config.onInit)
          ? config.onInit
          : [config.onInit];

    return {
      ...config,
      onInit: [...onInit, initializeNotes],
    };
  };
}
```

Use `async` only when configuration construction itself must await work. Runtime I/O belongs in hooks, endpoint handlers, jobs, or `onInit`, not at module import time.

## Robust Merge Patterns

- Return a new config and spread `...config` first.
- Map existing collections; return unmatched entries unchanged.
- Spread each nested object before replacing one key.
- Preserve optional arrays with `...(existing ?? [])`.
- Detect generated collection, field, endpoint path/method, and job slug collisions. The composition helpers above assume caller-supplied endpoint and task identifiers are unique.
- Treat prepend and append order as part of the plugin contract.
- Do not mutate the received config or nested arrays.
- Do not use truthy fallback for valid values such as an empty string or `false`; prefer `??` where appropriate.
- Offer callback overrides for structures that need semantic merging.
- Keep plugin-owned invariants after broad overrides, or document that the consumer owns the entire overridden structure.

When a plugin can be disabled but owns schema, preserve schema additions and disable only runtime behavior. Removing fields or collections based on a flag can make an existing database incompatible.

```ts
import type { AfterChangeHook, CollectionConfig, Endpoint, Plugin } from 'frogbot';

import { createNotesCollection } from './collection.js';
import { withNotesAfterChange } from './hooks.js';

type NotesRuntimeOptions = {
  disabled?: boolean;
  notesAfterChange: AfterChangeHook;
  notesEndpoint: Endpoint;
};

function addNotesSchema(collections: CollectionConfig[]): CollectionConfig[] {
  if (collections.some(({ slug }) => slug === 'notes')) {
    throw new Error("[plugin-notes] Collection slug 'notes' already exists.");
  }

  return [...collections, createNotesCollection()];
}

export function notesRuntimePlugin(options: NotesRuntimeOptions): Plugin {
  const { notesAfterChange, notesEndpoint } = options;
  const addNotesHooks = (collections: CollectionConfig[]): CollectionConfig[] =>
    collections.map((collection) =>
      collection.slug === 'notes'
        ? withNotesAfterChange({ collection, notesAfterChange })
        : collection,
    );

  return (config) => {
    const collections = addNotesSchema(config.collections);

    if (options.disabled) {
      return {
        ...config,
        collections,
      };
    }

    return {
      ...config,
      collections: addNotesHooks(collections),
      endpoints: [...(config.endpoints ?? []), notesEndpoint],
    };
  };
}
```

This variant replaces `notesPlugin()`; do not install both. It uses `createNotesCollection` from the collection example and `withNotesAfterChange` saved in `src/hooks.ts`. Supply a unique endpoint path/method and real runtime handlers. Only use this pattern when the disabled state is a supported plugin feature. Otherwise omit the option rather than inventing partial-disable semantics.

## Ordering And Errors

Plugins in `plugins` run serially in array order before FrogBot sanitizes the config. Each plugin receives the previous plugin's result.

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import { buildConfig } from 'frogbot';

import { notesPlugin } from './plugins/notes/index.js';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL ?? 'file:./frogbot.db' } }),
  collections: [],
  plugins: [rolesPlugin(), notesPlugin()],
});
```

Order plugins according to their dependencies. Throw actionable errors with a stable prefix such as `[plugin-notes]`; FrogBot adds the failing plugin's array index. Return the complete config from every path.

This app example assumes the collection-adding factory lives at `src/plugins/notes/index.ts` and `FROGBOT_SECRET` is set. The package name `@frogbotai/plugin-notes` elsewhere in this guide denotes the package you are authoring, not an existing dependency to install.

## Publishing

Published first-party packages use the `@frogbotai/plugin-*` scope, public access, the repository license and metadata, and built `dist` files only.

Before release:

1. Build the package from a clean `dist` directory.
2. Confirm each export-map target and declaration file exists.
3. Confirm client code is reachable only from `./client`.
4. Confirm required CSS and assets are included in `dist` and covered by `sideEffects`.
5. Run `pnpm pack` from the package directory, then inspect the emitted archive with `tar -tf <archive.tgz>` for missing or unintended files. The repository's pnpm version does not support `pack --dry-run`.
6. Test installation through the repository's release or package-consumer fixture before changing exports.

Repository owners publish all packages with:

```bash
pnpm publish-packages
```

Do not publish an individual first-party workspace manually. The repository release workflow owns synchronized versions and package order.

## Testing

Place integration fixtures under `test/<plugin-name>/` and browser coverage under `test/browser/`. Use the shared test helpers and a real FrogBot instance rather than testing only the returned object.

Test at least:

- default and customized options;
- collision and invalid-option errors;
- preservation of existing fields, hooks, endpoints, jobs, translations, and admin components;
- plugin ordering when another plugin changes the same config area;
- endpoint, hook, job, and initialization behavior through the running application;
- root import in a server context without loading client-only code;
- client export resolution and the rendered admin interaction;
- package build output when conditional exports or copied assets change.

Run the narrow repository command for the suite that owns the fixture. Common commands are:

```bash
pnpm test:unit
pnpm test:int:sqlite
pnpm test:browser
```

Database-backed integration suites can also run with `pnpm test:int:pg` or `pnpm test:int:mongo` when the plugin supports those adapters. Rebuild affected packages before a test that imports their built output.

## Public Boundary

Import public types and runtime APIs from `frogbot`, documented FrogBot subpaths, and `@frogbotai/ui`. Never import FrogBot package internals. Export only consumer-facing factories, helpers, components, and types, and use the repository's first-party plugins and root test suites as the source of truth for contracts.
