import type { NumberField } from '../../config/types.js';
import { applyFieldKind } from '../applyFieldKind.js';
import { describeOptionValue, rejectFieldOptions } from '../rejectFieldOptions.js';

export type RatingFieldArgs = Omit<
  Extract<NumberField, { hasMany?: false | undefined }>,
  'type' | 'hasMany' | 'minRows' | 'maxRows' | 'min' | 'max'
> & {
  max?: number;
};

export function ratingField(args: RatingFieldArgs): NumberField {
  const { max = 5, ...rest } = args;

  rejectFieldOptions({
    factory: 'ratingField',
    field: args,
    keys: ['hasMany', 'minRows', 'maxRows', 'min'],
  });

  if (!Number.isInteger(max) || max < 1 || max > 10) {
    throw new Error(
      `ratingField "${args.name}": max must be a whole number from 1 to 10, got ${describeOptionValue(max)}`,
    );
  }

  return applyFieldKind(
    { ...rest, type: 'number', min: 1, max },
    {
      kind: { type: 'rating', max },
      cell: true,
      Field: '@frogbotai/next/client#RatingField',
      check: (value) =>
        Number.isInteger(value) ? true : `Enter a whole number of stars from 1 to ${max}.`,
      description: `Whole-number rating from 1 to ${max}`,
      integer: true,
    },
  );
}
