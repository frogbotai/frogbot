import { describe, expect, it, vi } from 'vitest';

import { slugField } from '../../../../../packages/frogbot/src/fields/baseFields/slug/index.js';
import { wrapFieldRequestFunctions } from '../../../../../packages/frogbot/src/fields/config/wrapRequestFunctions.js';

describe('slugField', () => {
  it("returns Payload's slug field named slug", () => {
    expect(slugField()).toEqual({ name: 'slug', type: 'slug' });
  });

  it('passes options through and keeps the slug type', () => {
    const slugify = vi.fn();

    expect(
      slugField({ name: 'path', localized: true, slugify, unique: false, useAsSlug: 'title' }),
    ).toEqual({
      name: 'path',
      localized: true,
      slugify,
      type: 'slug',
      unique: false,
      useAsSlug: 'title',
    });
  });

  it('gives slugify the FrogBot request', async () => {
    const slugify = vi.fn(({ valueToSlugify }: { valueToSlugify?: string }) => valueToSlugify);
    const [field] = wrapFieldRequestFunctions([slugField({ slugify })]);
    const frogbot = { config: {} };
    const req = { payload: { config: {} }, frogbot, context: {} };

    expect('slugify' in field && field.slugify).not.toBe(slugify);

    await (field as { slugify: (args: object) => unknown }).slugify({
      data: { id: 1 },
      req,
      valueToSlugify: 'Hello',
    });

    expect(slugify).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: 1 }, valueToSlugify: 'Hello' }),
    );
  });
});
