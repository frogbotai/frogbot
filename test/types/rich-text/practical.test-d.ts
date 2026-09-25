import { lexicalEditor } from '@frogbotai/richtext-lexical';
import type { SerializedEditorState } from '@frogbotai/richtext-lexical/lexical';
import type { CollectionConfig, FrogBotConfig } from 'frogbot';
import { expectTypeOf } from 'vitest';

const content: SerializedEditorState = {
  root: {
    children: [],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
};

const Articles: CollectionConfig = {
  slug: 'articles',
  fields: [{ name: 'content', type: 'richText' }],
};

const config = {
  collections: [Articles],
  editor: lexicalEditor(),
} satisfies Pick<FrogBotConfig, 'collections' | 'editor'>;

expectTypeOf(content.root.children).toBeArray();
expectTypeOf(config.editor).toBeFunction();
