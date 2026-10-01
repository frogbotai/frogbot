import { LinkFeature, UploadFeature } from '@frogbotai/richtext-lexical';
import type { Field, FrogBot, FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

const rel: Field = {
  name: 'rel',
  type: 'text',
  defaultValue: ({ req }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return 'noopener';
  },
};

LinkFeature({
  enabledCollections: ['pages'],
  fields: ({ defaultFields }) => [
    ...defaultFields,
    rel,
    {
      name: 'sponsor',
      type: 'relationship',
      relationTo: 'users',
      filterOptions: ({ req }) => {
        expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

        return true;
      },
    },
  ],
});

LinkFeature({
  fields: [
    {
      name: 'title',
      type: 'text',
      validate: (_value, { req }) => {
        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;

        return true;
      },
    },
  ],
});

// @ts-expect-error Set either enabledCollections or disabledCollections, not both.
LinkFeature({ disabledCollections: ['users'], enabledCollections: ['pages'] });

UploadFeature({
  collections: {
    files: {
      fields: [
        {
          name: 'caption',
          type: 'text',
          access: { read: ({ req }) => Boolean(req.frogbot) },
          validate: (_value, { req }) => {
            expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

            return true;
          },
        },
      ],
    },
  },
  maxDepth: 1,
});

// @ts-expect-error Set either enabledCollections or disabledCollections, not both.
UploadFeature({ disabledCollections: ['files'], enabledCollections: ['files'] });
