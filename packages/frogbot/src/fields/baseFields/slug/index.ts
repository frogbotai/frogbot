import type { SlugField } from '../../config/types.js';

export type { SlugField, Slugify } from '../../config/types.js';

export type SlugFieldArgs = Omit<SlugField, 'name' | 'type'> & { name?: string };

/** Payload's `type: 'slug'` field, named `slug` unless set. */
export function slugField(args: SlugFieldArgs = {}): SlugField {
  return { name: 'slug', ...args, type: 'slug' };
}
