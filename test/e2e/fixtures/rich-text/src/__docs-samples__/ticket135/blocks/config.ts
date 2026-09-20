import { BlocksFeature, CodeBlock, lexicalEditor } from '@frogbotai/richtext-lexical';
import type { Block, CollectionConfig, RichTextField } from 'frogbot';

export const BannerBlock: Block = {
  slug: 'banner',
  admin: {
    components: {
      Block: '/__docs-samples__/ticket135/blocks/components#BannerBlock',
      Label: '/__docs-samples__/ticket135/blocks/components#BannerLabel',
    },
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'style',
      type: 'select',
      defaultValue: 'info',
      options: ['info', 'warning', 'error', 'success'],
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
  ],
};

export const CallToActionBlock: Block = {
  slug: 'callToAction',
  fields: [
    {
      name: 'heading',
      type: 'text',
      required: true,
    },
    {
      name: 'link',
      type: 'text',
    },
  ],
};

export const MentionBlock: Block = {
  slug: 'mention',
  fields: [
    {
      name: 'username',
      type: 'text',
      required: true,
    },
  ],
};

export const contentField: RichTextField = {
  name: 'content',
  type: 'richText',
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
      BlocksFeature({
        blocks: [BannerBlock, CallToActionBlock],
        inlineBlocks: [MentionBlock],
      }),
    ],
  }),
};

export const codeFeature = BlocksFeature({
  blocks: [
    CodeBlock({
      defaultLanguage: 'ts',
      languages: {
        plaintext: 'Plain text',
        js: 'JavaScript',
        ts: 'TypeScript',
        tsx: 'TSX',
        jsx: 'JSX',
      },
    }),
  ],
});

export const TypedCodeBlock = CodeBlock({
  languages: {
    ts: 'TypeScript',
    tsx: 'TSX',
  },
  typescript: {
    fetchTypes: [
      {
        url: 'https://unpkg.com/@types/react@19.1.11/index.d.ts',
        filePath: 'file:///node_modules/@types/react/index.d.ts',
      },
      {
        url: 'https://unpkg.com/@types/react@19.1.11/global.d.ts',
        filePath: 'file:///node_modules/@types/react/global.d.ts',
      },
      {
        url: 'https://unpkg.com/csstype@3.1.3/index.d.ts',
        filePath: 'file:///node_modules/csstype/index.d.ts',
      },
    ],
    paths: {
      csstype: ['file:///node_modules/csstype/index.d.ts'],
      react: ['file:///node_modules/@types/react/index.d.ts'],
    },
    typeRoots: ['node_modules/@types'],
    target: 'ES2022',
    enableSemanticValidation: true,
  },
});

export const BlocksSampleCollection: CollectionConfig = {
  slug: 'block-sample-posts',
  fields: [contentField],
};
