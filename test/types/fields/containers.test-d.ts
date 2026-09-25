import {
  type Block,
  type BlocksField,
  type Field,
  type FrogBotConfig,
  type GroupField,
  type Tab,
  type TabsField,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

const nestedField: Field = {
  fields: [
    {
      access: {
        read: ({ req }) => Boolean(req.frogbot),
      },
      hooks: {
        beforeChange: [({ req }) => req.frogbot.config.secret],
      },
      name: 'title',
      type: 'text',
      validate: (_value, { req }) => Boolean(req.frogbot) || 'Unavailable',
    },
  ],
  name: 'items',
  type: 'array',
};

const namedGroup: GroupField = {
  fields: [nestedField],
  name: 'details',
  type: 'group',
};

const unnamedGroup: GroupField = {
  fields: [nestedField],
  label: 'Details',
  type: 'group',
};

const namedTab: Tab = {
  fields: [namedGroup],
  name: 'content',
};

const unnamedTab: Tab = {
  fields: [unnamedGroup],
  label: 'Content',
};

const tabs: TabsField = {
  tabs: [namedTab, unnamedTab],
  type: 'tabs',
};

const block: Block = {
  fields: [tabs],
  jsx: {
    export: () => '<Callout />',
    import: () => false,
  },
  slug: 'callout',
};

const blocks: BlocksField = {
  blockReferences: [block, 'shared-callout'],
  blocks: [block],
  name: 'layout',
  type: 'blocks',
};

const rootBlocks = { blocks: [block] } satisfies Pick<FrogBotConfig, 'blocks'>;

expectTypeOf(blocks).toMatchTypeOf<Field>();
expectTypeOf(rootBlocks.blocks).toMatchTypeOf<Block[]>();
expectTypeOf(block.jsx).toEqualTypeOf<Block['jsx']>();
