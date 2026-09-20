import { sqliteAdapter } from '@frogbotai/db-sqlite';
import {
  BlocksFeature,
  HeadingFeature,
  lexicalEditor,
  lexicalHTMLField,
} from '@frogbotai/richtext-lexical';
import type { HTMLConvertersFunctionAsync } from '@frogbotai/richtext-lexical/html-async';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { articlesSlug, htmlArticlesSlug, restrictedNotesSlug, usersSlug } from './shared.js';

const customConverters: HTMLConvertersFunctionAsync = ({ defaultConverters }) => ({
  ...defaultConverters,
  paragraph: async ({ node, nodesToHTML }) => {
    const children = await nodesToHTML({ nodes: node.children });

    return `<section data-converter="custom">${children.join('')}</section>`;
  },
  relationship: async ({ node, populate }) => {
    const value = await populate?.({
      collectionSlug: node.relationTo,
      id: typeof node.value === 'object' ? node.value.id : node.value,
    });

    if (!value || !('title' in value)) return '<span data-related="denied">denied</span>';

    const child = 'child' in value && value.child;
    const grandchild = child && typeof child === 'object' && 'child' in child && child.child;
    const childKind =
      grandchild && typeof grandchild === 'object'
        ? 'deep'
        : child && typeof child === 'object'
          ? 'populated'
          : 'id';
    const secret = 'secret' in value ? String(value.secret) : 'hidden';
    const status = '_status' in value ? String(value._status) : 'none';

    return `<a data-child="${childKind}" data-secret="${secret}" data-status="${status}">${String(value.title)}</a>`;
  },
});

export const InlineCodeBlock = {
  slug: 'InlineCode',
  jsx: {
    import: ({ children }: { children: string }) => ({ code: children }),
    export: ({ fields }: { fields: { code?: string } }) => ({
      children: fields.code ?? '',
      props: {},
    }),
  },
  fields: [{ name: 'code', type: 'code' as const }],
};

export const CalloutBlock = {
  slug: 'Callout',
  jsx: {
    import: ({ children, markdownToLexical, props }: any) => ({
      content: markdownToLexical({ markdown: children }),
      tone: props?.tone,
    }),
    export: ({ fields, lexicalToMarkdown }: any) => ({
      children: lexicalToMarkdown({ editorState: fields.content }),
      props: { tone: fields.tone },
    }),
  },
  fields: [
    { name: 'tone', type: 'select' as const, options: ['info', 'warning'] },
    {
      name: 'content',
      type: 'richText' as const,
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({ inlineBlocks: [InlineCodeBlock] }),
        ],
      }),
    },
  ],
};

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

export const Articles: CollectionConfig = {
  slug: articlesSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'content', type: 'richText', required: true },
    {
      name: 'structuredContent',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({ blocks: [CalloutBlock], inlineBlocks: [InlineCodeBlock] }),
        ],
      }),
    },
    {
      name: 'headingOnly',
      type: 'richText',
      editor: lexicalEditor({ features: () => [HeadingFeature()] }),
    },
  ],
};

const HTMLArticles: CollectionConfig = {
  slug: htmlArticlesSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'content', type: 'richText', required: true },
    lexicalHTMLField({ htmlFieldName: 'contentHTML', lexicalFieldName: 'content' }),
    lexicalHTMLField({
      converters: customConverters,
      htmlFieldName: 'customHTML',
      lexicalFieldName: 'content',
    }),
    lexicalHTMLField({ htmlFieldName: 'missingHTML', lexicalFieldName: 'missingContent' }),
    lexicalHTMLField({
      htmlFieldName: 'storedHTML',
      lexicalFieldName: 'content',
      storeInDB: true,
    }),
    {
      name: 'details',
      type: 'group',
      fields: [
        { name: 'content', type: 'richText', editor: lexicalEditor() },
        lexicalHTMLField({ htmlFieldName: 'contentHTML', lexicalFieldName: 'content' }),
      ],
    },
  ],
};

const RestrictedNotes: CollectionConfig = {
  slug: restrictedNotesSlug,
  access: {
    create: () => true,
    read: ({ req }) => Boolean(req.user),
  },
  fields: [
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'secret', type: 'text', hidden: true },
    { name: 'child', type: 'relationship', relationTo: restrictedNotesSlug },
  ],
  versions: { drafts: true },
};

export default await buildTestConfig({
  collections: [Users, Articles, HTMLArticles, RestrictedNotes],
  db: sqliteAdapter({
    client: { url: process.env.SQLITE_URL ?? process.env.DATABASE_URL ?? 'file:./test-payload.db' },
    transactionOptions: {},
  }),
  defaultDepth: 2,
  editor: lexicalEditor(),
  localization: { defaultLocale: 'en', locales: ['en', 'es'] },
});
