import type { FrogBotRequest, SlugField, SlugFieldArgs } from 'frogbot';
import { slugField } from 'frogbot';
import { expectTypeOf } from 'vitest';

expectTypeOf(slugField).returns.toEqualTypeOf<SlugField>();

const options: SlugFieldArgs = {
  localized: true,
  name: 'path',
  required: false,
  slugify: ({ data, req, valueToSlugify }) => {
    expectTypeOf(data).toMatchTypeOf<{ id: number | string }>();
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();
    expectTypeOf(valueToSlugify).toBeAny();

    return valueToSlugify;
  },
  unique: false,
  useAsSlug: 'title',
  hooks: {
    beforeChange: [({ req }) => req.frogbot.config.secret],
  },
};

expectTypeOf(slugField(options).type).toEqualTypeOf<'slug'>();

// @ts-expect-error the 3.x lock checkbox is gone
slugField({ checkboxName: 'regenerate' });
