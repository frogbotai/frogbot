# Field Type Guards

Docs: https://docs.frogbot.ai/fields/overview

Import field guards from `frogbot`. They inspect field configuration at runtime; guards with type predicates also narrow TypeScript types.

```ts
import { fieldHasSubFields, fieldIsBlockType } from 'frogbot';
import type { Block, Field } from 'frogbot';

export function visit({
  fields,
  blocks = [],
  onField,
}: {
  fields: Field[];
  blocks?: Block[];
  onField: (field: Field) => void;
}) {
  const rootBlocks = new Map(blocks.map((block) => [block.slug, block]));
  const visited = new WeakSet<Field>();

  function visitField(field: Field): void {
    if (visited.has(field)) return;

    visited.add(field);
    onField(field);

    if (fieldHasSubFields(field)) {
      field.fields.forEach(visitField);
    }

    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        tab.fields.forEach(visitField);
      }
    }

    if (fieldIsBlockType(field)) {
      for (const reference of field.blockReferences ?? field.blocks) {
        const block = typeof reference === 'string' ? rootBlocks.get(reference) : reference;

        if (!block) {
          throw new Error(`Unknown root block reference: ${reference}`);
        }

        block.fields.forEach(visitField);
      }
    }
  }

  fields.forEach(visitField);
}
```

This schema inspector calls `onField` once per field object, including layout fields. It follows arrays, collapsibles, named and unnamed groups, rows, both named and unnamed tabs, inline blocks, and root block references. Identity tracking terminates recursive block references and avoids inspecting shared field objects repeatedly; this is not a per-document-path walker.

Pass the application's root `config.blocks` to resolve string references. Use `blocks: []` when configuring `blockReferences`; a nonempty `blocks` list cannot coexist with `blockReferences`. Missing root references throw rather than silently skipping fields. Rich Text editor feature configuration is separate from this `Field` tree.

## Field shape guards

| Guard                              | Match and narrowing                                           |
| ---------------------------------- | ------------------------------------------------------------- |
| `fieldHasSubFields(field)`         | Array, Collapsible, Group, or Row field with `fields`         |
| `fieldIsArrayType(field)`          | `ArrayField`                                                  |
| `fieldIsBlockType(field)`          | `BlocksField`                                                 |
| `fieldIsGroupType(field)`          | `GroupField`                                                  |
| `fieldSupportsMany(field)`         | Relationship, Select, or Upload field that supports `hasMany` |
| `fieldHasMaxDepth(field)`          | Join, Relationship, or Upload field with a numeric `maxDepth` |
| `fieldIsPresentationalOnly(field)` | `UIField`                                                     |
| `fieldIsSidebar(field)`            | Field whose `admin.position` is `'sidebar'`                   |
| `fieldIsID(field)`                 | Field named `id`                                              |
| `fieldAffectsData(field)`          | Data-bearing field or named tab                               |
| `tabHasName(tab)`                  | `NamedTab` with `name`                                        |
| `groupHasName(group)`              | `NamedGroupField` with `name`                                 |

The generic field guards preserve additional properties already known on the input.

```ts
import { fieldHasSubFields } from 'frogbot';
import type { Field } from 'frogbot';

export function preserveSource(field: Field & { source: 'plugin' }) {
  if (fieldHasSubFields(field)) {
    const fields: Field[] = field.fields;
    const source: 'plugin' = field.source;

    return { fields, source };
  }
}
```

## Boolean field checks

These checks return `boolean` rather than narrowing to a more specific public field type.

| Check                                                  | Returns `true` when                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `fieldIsHiddenOrDisabled(field)`                       | The field is hidden or disabled                                   |
| `fieldIsLocalized(field)`                              | The field or tab is configured as localized                       |
| `fieldShouldBeLocalized({ field, parentIsLocalized })` | The field should establish localized storage at its current level |
| `fieldIsVirtual(field)`                                | The field or tab is virtual                                       |

```ts
import { fieldShouldBeLocalized } from 'frogbot';

const localizedHere = fieldShouldBeLocalized({
  field,
  parentIsLocalized: false,
});
```

Pass the actual parent localization state when recursing. A localized parent already controls storage for its nested fields.

## Option guards

Select and Radio options can be strings or objects with `label` and `value`.

| Guard                        | Narrowing                                      |
| ---------------------------- | ---------------------------------------------- |
| `optionIsObject(option)`     | `OptionObject`                                 |
| `optionIsValue(option)`      | `string`                                       |
| `optionsAreObjects(options)` | `OptionObject[]` by checking the first element |

```ts
import { optionIsObject } from 'frogbot';
import type { Option } from 'frogbot';

export function optionValue(option: Option) {
  return optionIsObject(option) ? option.value : option;
}
```

## Relationship value guard

`valueIsValueWithRelation(value)` narrows an unknown value to `ValueWithRelation`, an object containing `relationTo` and `value`.

```ts
import { valueIsValueWithRelation } from 'frogbot';

if (valueIsValueWithRelation(value)) {
  value.relationTo;
  value.value;
}
```

## Traverse a collection with root blocks

Keep `visit` above in a local `visitFields.ts` module. This example reaches fields through both tab shapes and through inline and referenced blocks:

```ts
import type { Block, FrogbotConfig } from 'frogbot';

import { visit } from './visitFields';

export const Callout: Block = {
  slug: 'callout',
  fields: [{ name: 'message', type: 'text' }],
};

export const Hero: Block = {
  slug: 'hero',
  fields: [{ name: 'heading', type: 'text' }],
};

export const schema = {
  blocks: [Callout],
  collections: [
    {
      slug: 'pages',
      fields: [
        {
          type: 'tabs',
          tabs: [
            {
              label: 'Content',
              fields: [{ name: 'title', type: 'text' }],
            },
            {
              name: 'meta',
              label: 'Metadata',
              fields: [{ name: 'description', type: 'textarea' }],
            },
          ],
        },
        { name: 'hero', type: 'blocks', blocks: [Hero] },
        {
          name: 'layout',
          type: 'blocks',
          blocks: [],
          blockReferences: ['callout', Hero],
        },
      ],
    },
  ],
} satisfies Pick<FrogbotConfig, 'blocks' | 'collections'>;

export const fieldNames: string[] = [];

for (const collection of schema.collections) {
  visit({
    fields: collection.fields,
    blocks: schema.blocks,
    onField: (field) => {
      if ('name' in field && typeof field.name === 'string') {
        fieldNames.push(field.name);
      }
    },
  });
}
```

The named tab contributes its child `description` field. Tab objects themselves are not `Field` objects; use `tabHasName` when separately processing tab metadata or building data paths.
