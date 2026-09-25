# Fields

Docs: https://docs.frogbot.ai/fields/overview and https://docs.frogbot.ai/fields/default-fields

Import field types and helpers from `frogbot`.

```ts
import { slugField } from 'frogbot';
import type { CollectionConfig, Field } from 'frogbot';
```

## Field types

`Field` is the union accepted by collection and nested field lists. Concrete public types include:

| Kind                  | Types                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Values                | `CheckboxField`, `CodeField`, `DateField`, `EmailField`, `JSONField`, `NumberField`, `PointField`, `RadioField`, `SelectField`, `TextareaField`, `TextField` |
| Relations             | `JoinField`, `RelationshipField`, `UploadField`                                                                                                              |
| Structured content    | `ArrayField`, `BlocksField`, `RichTextField`                                                                                                                 |
| Containers and layout | `CollapsibleField`, `GroupField`, `RowField`, `TabsField`, `UIField`                                                                                         |

Use the concrete type when defining a reusable field and `Field` when processing arbitrary field configuration.

## Recursive fields

Field configuration is recursive:

| Container     | Nested configuration                       | Data shape                                                 |
| ------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Array         | `fields: Field[]`                          | Repeated objects                                           |
| Collapsible   | `fields: Field[]`                          | Presentational; nested values stay at the current level    |
| Named group   | `fields: Field[]`                          | Object under the group's `name`                            |
| Unnamed group | `fields: Field[]`                          | Presentational; nested values stay at the current level    |
| Row           | `fields: Field[]`                          | Presentational; nested values stay at the current level    |
| Tabs          | `tabs: Tab[]`, each with `fields: Field[]` | Named tabs create objects; unnamed tabs are presentational |
| Block         | `fields: Field[]`                          | Object selected through a Blocks or Rich Text field        |

A Blocks field uses `blocks: Block[]` and optional `blockReferences`; each `Block` owns its recursive `fields`. `fieldHasSubFields` therefore matches arrays, collapsibles, groups, and rows, not Blocks or Tabs fields.

```ts
import type { CollectionConfig } from 'frogbot';

export const Pages: CollectionConfig = {
  slug: 'pages',
  fields: [
    {
      name: 'sections',
      type: 'array',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'heading', type: 'text', required: true },
            { name: 'eyebrow', type: 'text' },
          ],
        },
      ],
    },
  ],
};
```

Use the public guards in the [field type guards skill reference](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/FIELD-TYPE-GUARDS.md) when walking unknown field trees. Handle `tabs`, `blocks`, and `blockReferences` separately from `fieldHasSubFields`.

## Slug field

`slugField()` returns a `RowField` containing a generated Text field and a lock checkbox. Its source is a top-level field in the same collection.

```ts
import { slugField } from 'frogbot';
import type { CollectionConfig } from 'frogbot';

export const Pages: CollectionConfig = {
  slug: 'pages',
  fields: [{ name: 'title', type: 'text', required: true }, slugField()],
};
```

Defaults are `name: 'slug'`, `checkboxName: 'generateSlug'`, `useAsSlug: 'title'`, and `required: true`. Set `disableUnique: true` to disable the unique index. `fieldToUse` is also accepted as the source field. `overrides` receives and returns the generated `RowField`; `slugify` may synchronously or asynchronously return a string or `undefined`.

```ts
export const pageSlug = slugField({
  name: 'path',
  useAsSlug: 'title',
  slugify: ({ valueToSlugify }) =>
    typeof valueToSlugify === 'string'
      ? valueToSlugify
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
      : undefined,
});
```

## Rich Text

Install `@frogbotai/richtext-lexical` and create editors with `lexicalEditor`.

```ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  editor: lexicalEditor({}),
  collections: [
    {
      slug: 'pages',
      fields: [{ name: 'content', type: 'richText' }],
    },
  ],
});
```

Every Rich Text field needs an editor. A root editor applies to top-level Rich Text fields unless the field supplies `editor`. A Rich Text field nested inside another field must set its own editor.

```ts
import { FixedToolbarFeature, lexicalEditor } from '@frogbotai/richtext-lexical';
import type { RichTextField } from 'frogbot';

export const contentField: RichTextField = {
  name: 'content',
  type: 'richText',
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [...defaultFeatures, FixedToolbarFeature()],
  }),
};
```

Import serialized state types from the Lexical subpath.

```ts
import type { SerializedEditorState } from '@frogbotai/richtext-lexical/lexical';
```

Reusable FrogBot `Block` objects work in Rich Text through `BlocksFeature({ blocks })`. Import server features from `@frogbotai/richtext-lexical`, client features from `@frogbotai/richtext-lexical/client`, and Lexical APIs from the package's Lexical subpaths.

## Conditional fields

`admin.condition` receives top-level form data, sibling data, and a context containing `user`. It does not receive a `FrogBotRequest`. Use top-level data for a document-wide switch and sibling data for a nested group's switch:

```ts
import type { CollectionConfig } from 'frogbot';

import { Media } from './collections/Media';

export const FeaturePages: CollectionConfig = {
  slug: 'feature-pages',
  fields: [
    { name: 'enableFeature', type: 'checkbox' },
    {
      name: 'featureText',
      type: 'text',
      admin: {
        condition: (data, _siblingData, { user }) => {
          return Boolean(user) && data.enableFeature === true;
        },
      },
    },
    {
      name: 'hero',
      type: 'group',
      fields: [
        {
          name: 'type',
          type: 'select',
          options: ['none', 'highImpact', 'mediumImpact', 'lowImpact'],
          defaultValue: 'lowImpact',
        },
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          required: true,
          admin: {
            condition: (_data, siblingData) => {
              return siblingData.type === 'highImpact' || siblingData.type === 'mediumImpact';
            },
          },
        },
      ],
    },
  ],
};

export const conditionalCollections: CollectionConfig[] = [Media, FeaturePages];
```

Register these collections in the root config. Conditions control form visibility, not API permissions. Use field access callbacks, whose context includes `req.user`, to protect reads and writes.

## Virtual fields

Use `virtual: true` with an `afterRead` field hook for a computed value, or a relationship path for a linked value. Neither creates a stored copy. The `users` collection below must define the `name` field referenced by `author.name`.

```ts
import type { CollectionConfig, TextField } from 'frogbot';

import { Users } from './collections/Users';

export const computedVirtualField: TextField = {
  name: 'fullName',
  type: 'text',
  virtual: true,
  hooks: {
    afterRead: [
      ({ siblingData }) => {
        const firstName = typeof siblingData.firstName === 'string' ? siblingData.firstName : '';
        const lastName = typeof siblingData.lastName === 'string' ? siblingData.lastName : '';

        return `${firstName} ${lastName}`.trim();
      },
    ],
  },
};

export const pathVirtualField: TextField = {
  name: 'authorName',
  type: 'text',
  virtual: 'author.name',
};

export const Profiles: CollectionConfig = {
  slug: 'profiles',
  fields: [
    { name: 'firstName', type: 'text' },
    { name: 'lastName', type: 'text' },
    computedVirtualField,
  ],
};

export const AuthoredPosts: CollectionConfig = {
  slug: 'posts',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'author', type: 'relationship', relationTo: 'users' },
    pathVirtualField,
  ],
};

export const virtualCollections: CollectionConfig[] = [Users, Profiles, AuthoredPosts];
```

Register these collections together. Relationship virtual values resolve during reads; write changes through the source fields or related document, not the virtual field. Apply access control to derived values when their source data is sensitive.

## Composable field factory

Build fresh field objects on every call. A typed override callback can merge selected properties without an untyped deep-merge helper or a cast. This local `link` factory supports internal references, custom URLs, optional labels, and configurable appearances:

```ts
import type { CollectionConfig, GroupField } from 'frogbot';

export type LinkFieldOptions = {
  appearances?: Array<'default' | 'outline'> | false;
  disableLabel?: boolean;
  overrides?: (field: GroupField) => GroupField;
};

export function link({
  appearances = ['default', 'outline'],
  disableLabel = false,
  overrides,
}: LinkFieldOptions = {}): GroupField {
  const field: GroupField = {
    name: 'link',
    type: 'group',
    admin: { hideGutter: true },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'type',
            type: 'radio',
            options: [
              { label: 'Internal link', value: 'reference' },
              { label: 'Custom URL', value: 'custom' },
            ],
            defaultValue: 'reference',
            admin: { layout: 'horizontal', width: '50%' },
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: 'Open in new tab',
            admin: { width: '50%', style: { alignSelf: 'flex-end' } },
          },
        ],
      },
      {
        name: 'reference',
        type: 'relationship',
        relationTo: ['pages'],
        required: true,
        maxDepth: 1,
        admin: { condition: (_data, siblingData) => siblingData.type === 'reference' },
      },
      {
        name: 'url',
        type: 'text',
        label: 'Custom URL',
        required: true,
        admin: { condition: (_data, siblingData) => siblingData.type === 'custom' },
      },
    ],
  };

  if (!disableLabel) {
    field.fields.push({ name: 'label', type: 'text', required: true });
  }

  if (appearances !== false && appearances.length > 0) {
    field.fields.push({
      name: 'appearance',
      type: 'select',
      defaultValue: appearances[0],
      options: appearances.map((value) => ({
        label: value === 'default' ? 'Default' : 'Outline',
        value,
      })),
    });
  }

  return overrides ? overrides(field) : field;
}

export const LinkPages: CollectionConfig = {
  slug: 'pages',
  fields: [
    { name: 'title', type: 'text', required: true },
    link({ appearances: false }),
    link({
      appearances: ['outline'],
      disableLabel: true,
      overrides: (field) => ({
        ...field,
        name: 'cta',
        admin: { ...field.admin, description: 'Call to action button' },
      }),
    }),
  ],
};
```
