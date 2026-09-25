import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import type { FrogBotConfig } from '../../../packages/frogbot/src/config/types.js';
import { openAccess } from '../../__helpers/shared/buildTestConfig.js';

const { databaseAdapter } = await import('../../databaseAdapter.js');

const config: FrogBotConfig = {
  secret: 'test-secret',
  db: databaseAdapter,
  typescript: { autoGenerate: false },
  collections: [
    {
      slug: 'vector-documents',
      access: openAccess,
      versions: { drafts: { autosave: true, validate: false } },
      hooks: {
        beforeValidate: [
          ({ data }) => {
            if (data?.title !== 'collection-before-validate') return data;

            return { ...data, embedding: [1, 2] };
          },
        ],
        beforeChange: [
          ({ data }) => {
            if (data?.title === 'collection-mutated') {
              return { ...data, embedding: [1, NaN, 3] };
            }

            if (data?.title === 'collection-valid') {
              return { ...data, embedding: [1, 2, 3] };
            }

            return data;
          },
        ],
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'embedding', type: 'vector', dimensions: 3, required: true },
        { name: 'optionalEmbedding', type: 'vector', dimensions: 3 },
        {
          name: 'group',
          type: 'group',
          fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }],
        },
        {
          type: 'tabs',
          tabs: [
            {
              label: 'Details',
              name: 'details',
              fields: [
                {
                  type: 'row',
                  fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }],
                },
              ],
            },
          ],
        },
        {
          type: 'collapsible',
          label: 'Extra',
          fields: [{ name: 'extraEmbedding', type: 'vector', dimensions: 3 }],
        },
        {
          name: 'items',
          type: 'array',
          fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }],
        },
        {
          name: 'content',
          type: 'blocks',
          blocks: [
            {
              slug: 'note',
              fields: [{ name: 'embedding', type: 'vector', dimensions: 3 }],
            },
          ],
        },
        {
          name: 'mutated',
          type: 'vector',
          dimensions: 3,
          hooks: {
            beforeValidate: [
              ({ value }) => (Array.isArray(value) && value[0] === 9 ? [9, Infinity, 9] : value),
            ],
            beforeChange: [
              ({ value }) => (Array.isArray(value) && value[0] === 7 ? [7, NaN, 7] : value),
              ({ siblingData, value }) => {
                if (Array.isArray(value) && value[0] === 8) {
                  siblingData.mutated = [8, Infinity, 8];
                }

                return undefined;
              },
            ],
          },
        },
      ],
    },
  ],
};

export default buildConfig(config);
