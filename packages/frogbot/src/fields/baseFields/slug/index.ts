import type { TypeWithID } from 'payload';
import { slugField as upstreamSlugField } from 'payload';

import type { FrogBotRequest } from '../../../types/request.js';
import type { RowField } from '../../config/types.js';
import { generateSlug } from './generateSlug.js';

export type Slugify<T extends TypeWithID = any> = (args: {
  data: T;
  req: FrogBotRequest;
  valueToSlugify?: any;
}) => Promise<string | undefined> | string | undefined;

type UpstreamSlugFieldArgs = NonNullable<Parameters<typeof upstreamSlugField>[0]>;

export type SlugFieldArgs = Omit<UpstreamSlugFieldArgs, 'overrides' | 'slugify'> & {
  overrides?: (field: RowField) => RowField;
  slugify?: Slugify;
};

export type SlugField = (args?: SlugFieldArgs) => RowField;

export const slugField: SlugField = (args = {}) => {
  const {
    checkboxName = 'generateSlug',
    fieldToUse,
    name: slugFieldName = 'slug',
    overrides,
    slugify,
    useAsSlug: useAsSlugFromArgs = 'title',
    ...options
  } = args;
  const useAsSlug = fieldToUse || useAsSlugFromArgs;

  return upstreamSlugField({
    ...options,
    checkboxName,
    fieldToUse,
    name: slugFieldName,
    overrides: (upstreamField) => {
      const field = upstreamField as RowField;
      const checkbox = field.fields.find(
        (nestedField) => 'name' in nestedField && nestedField.name === checkboxName,
      );

      if (checkbox && 'hooks' in checkbox) {
        checkbox.hooks = {
          ...checkbox.hooks,
          beforeChange: [],
        };
      }

      const text = field.fields.find(
        (nestedField) => 'name' in nestedField && nestedField.name === slugFieldName,
      );

      if (text?.type === 'text') {
        text.hooks = {
          ...text.hooks,
          beforeValidate: [generateSlug({ checkboxName, slugFieldName, slugify, useAsSlug })],
        };
      }

      return overrides ? (overrides(field) as typeof upstreamField) : upstreamField;
    },
    slugify: slugify as UpstreamSlugFieldArgs['slugify'],
    useAsSlug: useAsSlugFromArgs,
  }) as RowField;
};
