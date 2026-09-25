import type { FrogBotRequest, RowField, SlugField } from 'frogbot';
import { slugField } from 'frogbot';
import { expectTypeOf } from 'vitest';

expectTypeOf(slugField).toEqualTypeOf<SlugField>();

const options: NonNullable<Parameters<SlugField>[0]> = {
  checkboxName: 'regenerate',
  disableUnique: true,
  fieldToUse: 'legacyTitle',
  localized: true,
  name: 'path',
  position: 'sidebar',
  required: false,
  slugify: ({ data, req, valueToSlugify }) => {
    expectTypeOf(data).toMatchTypeOf<{ id: number | string }>();
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
    expectTypeOf(valueToSlugify).toBeAny();

    return valueToSlugify;
  },
  useAsSlug: 'title',
  overrides: (field) => {
    expectTypeOf(field).toEqualTypeOf<RowField>();

    field.fields.push({
      type: 'row',
      fields: [
        {
          name: 'nested',
          type: 'text',
          hooks: {
            beforeChange: [({ req }) => req.frogbot.config.secret],
          },
        },
      ],
    });

    return field;
  },
};

expectTypeOf(slugField(options)).toEqualTypeOf<RowField>();
