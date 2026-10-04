import {
  BlocksFeature,
  lexicalEditor,
  LinkFeature,
  UploadFeature,
} from '@frogbotai/richtext-lexical';
import type { CollectionConfig, FrogBotRequest, Plugin, TextField } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  assetHandlerResponse,
  assetsSlug,
  bodyBlockSlug,
  brokenPagesSlug,
  filesSlug,
  layoutBlockSlug,
  pagesSlug,
  previewFailureMessage,
  usersSlug,
} from './shared.js';

export type RequestCall = {
  hasFrogBot: boolean;
  slot: string;
};

export const requestCalls: RequestCall[] = [];

function recordRequest(slot: string, req: FrogBotRequest): void {
  requestCalls.push({ hasFrogBot: Boolean(Reflect.get(req, 'frogbot')), slot });

  Reflect.deleteProperty(req, 'frogbot');
}

function recordedTextField(name: string, slot: string): TextField {
  return {
    name,
    type: 'text',
    defaultValue: ({ req }) => {
      recordRequest(`${slot}.defaultValue`, req);

      return name;
    },
    validate: (_value, { req }) => {
      recordRequest(`${slot}.validate`, req);

      return true;
    },
  };
}

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Files: CollectionConfig = {
  slug: filesSlug,
  file: true,
  fields: [],
};

const Pages: CollectionConfig = {
  slug: pagesSlug,
  access: openAccess,
  admin: {
    formatDocURL: ({ defaultURL, req }) => {
      recordRequest('formatDocURL', req);

      return defaultURL;
    },
    preview: (doc, { req }) => {
      recordRequest('preview', req);

      return `/preview/${String(doc.id)}`;
    },
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      access: {
        read: ({ req }) => {
          recordRequest('access.read', req);

          return true;
        },
      },
      defaultValue: ({ req }) => {
        recordRequest('defaultValue', req);

        return 'Untitled';
      },
      validate: (_value, { req }) => {
        recordRequest('validate', req);

        return true;
      },
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: usersSlug,
      filterOptions: ({ req }) => {
        recordRequest('relationship.filterOptions', req);

        return true;
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: filesSlug,
      filterOptions: ({ req }) => {
        recordRequest('upload.filterOptions', req);

        return true;
      },
    },
    {
      name: 'color',
      type: 'select',
      options: ['red', 'green'],
      filterOptions: ({ options, req }) => {
        recordRequest('select.filterOptions', req);

        return options;
      },
    },
    {
      name: 'layout',
      type: 'blocks',
      blocks: [{ slug: layoutBlockSlug, fields: [{ name: 'heading', type: 'text' }] }],
      filterOptions: ({ req }) => {
        recordRequest('blocks.filterOptions', req);

        return true;
      },
    },
    {
      name: 'body',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          LinkFeature({
            fields: ({ defaultFields }) => [...defaultFields, recordedTextField('rel', 'link')],
          }),
          UploadFeature({
            collections: {
              [assetsSlug]: { fields: [recordedTextField('caption', 'uploadNode')] },
            },
          }),
          BlocksFeature({
            blocks: [
              {
                slug: bodyBlockSlug,
                fields: [
                  {
                    name: 'tone',
                    type: 'text',
                    defaultValue: ({ req }) => {
                      recordRequest('body.defaultValue', req);

                      return 'info';
                    },
                    validate: (_value, { req }) => {
                      recordRequest('body.validate', req);

                      return true;
                    },
                  },
                ],
              },
            ],
          }),
        ],
      }),
    },
  ],
};

const Assets: CollectionConfig = {
  slug: assetsSlug,
  access: {
    ...openAccess,
    read: ({ req }) => {
      recordRequest('assets.access.read', req);

      return true;
    },
  },
  upload: {
    handlers: [
      (req) => {
        recordRequest('upload.handler', req);

        return new Response(assetHandlerResponse);
      },
    ],
  },
  fields: [],
};

const BrokenPages: CollectionConfig = {
  slug: brokenPagesSlug,
  access: openAccess,
  admin: {
    preview: () => {
      throw new Error(previewFailureMessage);
    },
  },
  fields: [{ name: 'title', type: 'text' }],
};

export const addPages: Plugin = (config) => ({
  ...config,
  collections: [...config.collections, Pages, BrokenPages, Assets],
});

export default await buildTestConfig({
  collections: [Users, Files],
  editor: lexicalEditor(),
  localization: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    filterAvailableLocales: ({ locales, req }) => {
      recordRequest('filterAvailableLocales', req);

      return locales.filter(({ code }) => code === 'en');
    },
  },
  plugins: [addPages],
});
