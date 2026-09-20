import type { CollectionConfig, FieldHook } from 'frogbot';

import { slugField } from '../../packages/frogbot/src/fields/baseFields/slug/index.js';
import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  draftPostsSlug,
  nestedFieldsSlug,
  nonUniquePostsSlug,
  postsSlug,
  rejectedTitle,
  undefinedSlugPostsSlug,
} from './shared.js';

const recordNestedRequest: FieldHook = async ({ req, value }) => {
  const { totalDocs } = await req.frogbot.count({
    collection: nestedFieldsSlug,
    overrideAccess: true,
    req,
  });

  return `${String(value)}:${totalDocs}`;
};

const Posts: CollectionConfig = {
  slug: postsSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField({
      slugify: async ({ req, valueToSlugify }) => {
        if (!req.frogbot) {
          throw new Error('req.frogbot is unavailable');
        }

        if (valueToSlugify === rejectedTitle) {
          throw new Error('slug generation rejected');
        }

        await req.frogbot.count({ collection: postsSlug, overrideAccess: true, req });

        return String(valueToSlugify)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
      },
    }),
  ],
};

const NonUniquePosts: CollectionConfig = {
  slug: nonUniquePostsSlug,
  access: openAccess,
  fields: [{ name: 'title', type: 'text', required: true }, slugField({ disableUnique: true })],
};

const UndefinedSlugPosts: CollectionConfig = {
  slug: undefinedSlugPostsSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField({ slugify: async () => undefined }),
  ],
};

const DraftPosts: CollectionConfig = {
  slug: draftPostsSlug,
  access: openAccess,
  versions: { drafts: { autosave: true } },
  fields: [{ name: 'title', type: 'text', required: true }, slugField()],
};

const NestedFields: CollectionConfig = {
  slug: nestedFieldsSlug,
  access: openAccess,
  fields: [
    {
      name: 'group',
      type: 'group',
      fields: [
        { name: 'value', type: 'text', hooks: { beforeChange: [recordNestedRequest] } },
        {
          name: 'accessValue',
          type: 'text',
          access: {
            create: async ({ req }) => {
              await req.frogbot.count({
                collection: nestedFieldsSlug,
                overrideAccess: true,
                req,
              });

              return true;
            },
          },
        },
        {
          name: 'validatedValue',
          type: 'text',
          validate: async (value, { req }) => {
            if (!req?.frogbot) {
              return 'req.frogbot is unavailable';
            }

            await req.frogbot.count({
              collection: nestedFieldsSlug,
              overrideAccess: true,
              req,
            });

            return value === 'valid' || 'nested value is invalid';
          },
        },
      ],
    },
    {
      name: 'items',
      type: 'array',
      fields: [{ name: 'value', type: 'text', hooks: { beforeChange: [recordNestedRequest] } }],
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          name: 'details',
          fields: [{ name: 'value', type: 'text', hooks: { beforeChange: [recordNestedRequest] } }],
        },
      ],
    },
    {
      name: 'content',
      type: 'blocks',
      blocks: [
        {
          slug: 'note',
          fields: [{ name: 'value', type: 'text', hooks: { beforeChange: [recordNestedRequest] } }],
        },
      ],
    },
  ],
};

export default await buildTestConfig({
  collections: [Posts, NonUniquePosts, UndefinedSlugPosts, DraftPosts, NestedFields],
});
