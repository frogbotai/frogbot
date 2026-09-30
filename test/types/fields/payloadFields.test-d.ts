import type { CollectionConfig, Field, FrogBot, TextField } from 'frogbot';
import type { TextField as PayloadTextField } from 'payload';
import { expectTypeOf } from 'vitest';

const payloadTitleField = ({ name }: { name: string }): PayloadTextField => ({
  hooks: {
    beforeChange: [
      ({ value, path, req }) => {
        expectTypeOf(req.payload).not.toBeAny();

        return path.length ? value : value;
      },
    ],
  },
  name,
  type: 'text',
});

const titleField = (options: Parameters<typeof payloadTitleField>[0]): TextField =>
  payloadTitleField(options) as TextField;

const rawField = payloadTitleField({ name: 'rawTitle' });

// @ts-expect-error A Payload-typed field needs the documented `as Field` cast.
const unwrappedField: Field = rawField;

const castField: Field = rawField as Field;

const posts: CollectionConfig = {
  slug: 'posts',
  fields: [
    titleField({ name: 'title' }),
    castField,
    {
      hooks: {
        beforeChange: [
          ({ req, value, schemaPath }) => {
            expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();
            expectTypeOf(req).not.toHaveProperty('payload');

            return schemaPath.length ? value : value;
          },
        ],
      },
      name: 'inlineTitle',
      type: 'text',
      validate: (value, { minLength, req }) => {
        expectTypeOf(value).toBeAny();
        expectTypeOf(minLength).toEqualTypeOf<number | undefined>();
        expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

        return true;
      },
    },
    {
      fields: [
        {
          hooks: {
            beforeChange: [
              ({ req, value }) => {
                expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

                return value;
              },
            ],
          },
          name: 'nestedTitle',
          type: 'text',
          validate: (value, { minLength, req }) => {
            expectTypeOf(value).toBeAny();
            expectTypeOf(minLength).toEqualTypeOf<number | undefined>();
            expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

            return true;
          },
        },
        {
          hasMany: true,
          name: 'nestedTags',
          type: 'text',
          validate: (value, { minLength, req }) => {
            expectTypeOf(value).toBeAny();
            expectTypeOf(minLength).toEqualTypeOf<number | undefined>();
            expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

            return true;
          },
        },
      ],
      name: 'items',
      type: 'array',
    },
    {
      blocks: [
        {
          fields: [
            {
              hooks: {
                beforeChange: [
                  ({ req, value }) => {
                    expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

                    return value;
                  },
                ],
              },
              name: 'blockTitle',
              type: 'text',
              validate: (value, { minLength, req }) => {
                expectTypeOf(value).toBeAny();
                expectTypeOf(minLength).toEqualTypeOf<number | undefined>();
                expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

                return true;
              },
            },
            {
              name: 'count',
              type: 'number',
              validate: (value, { max, req }) => {
                expectTypeOf(value).toBeAny();
                expectTypeOf(max).toEqualTypeOf<number | undefined>();
                expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

                return true;
              },
            },
          ],
          slug: 'card',
        },
      ],
      name: 'layout',
      type: 'blocks',
    },
  ],
};

expectTypeOf(unwrappedField).toMatchTypeOf<Field>();
expectTypeOf(posts.fields).toEqualTypeOf<Field[]>();
