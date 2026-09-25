import type { Block, Field, FrogBotConfig, Option } from 'frogbot';
import {
  fieldHasSubFields,
  fieldIsBlockType,
  fieldShouldBeLocalized,
  optionIsObject,
  valueIsValueWithRelation,
} from 'frogbot';

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

export function preserveSource(field: Field & { source: 'plugin' }) {
  if (fieldHasSubFields(field)) {
    const fields: Field[] = field.fields;
    const source: 'plugin' = field.source;

    return { fields, source };
  }
}

export function localization(field: Field) {
  const localizedHere = fieldShouldBeLocalized({
    field,
    parentIsLocalized: false,
  });

  return localizedHere;
}

export function optionValue(option: Option) {
  return optionIsObject(option) ? option.value : option;
}

export function relationValue(value: unknown) {
  if (valueIsValueWithRelation(value)) {
    const relationTo = value.relationTo;
    const relatedValue = value.value;

    return { relationTo, value: relatedValue };
  }
}

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
} satisfies Pick<FrogBotConfig, 'blocks' | 'collections'>;

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
