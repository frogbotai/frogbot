import type { NumberField } from '../../config/types.js';
import { acceptAnyValue, applyFieldKind } from '../applyFieldKind.js';
import { describeOptionValue, rejectFieldOptions } from '../rejectFieldOptions.js';

export type PercentFieldArgs = Omit<
  Extract<NumberField, { hasMany?: false | undefined }>,
  'type' | 'hasMany' | 'minRows' | 'maxRows'
> & {
  precision?: number;
};

export function percentField(args: PercentFieldArgs): NumberField {
  const { precision = 0, ...rest } = args;

  rejectFieldOptions({
    factory: 'percentField',
    field: args,
    keys: ['hasMany', 'minRows', 'maxRows'],
  });

  if (!Number.isInteger(precision) || precision < 0 || precision > 8) {
    throw new Error(
      `percentField "${args.name}": precision must be a whole number from 0 to 8, got ${describeOptionValue(precision)}`,
    );
  }

  return applyFieldKind(
    { ...rest, type: 'number' },
    {
      kind: { type: 'percent', precision },
      cell: true,
      Field: '@frogbotai/next/client#PercentField',
      check: acceptAnyValue,
      description: 'Fraction where 1 means 100%, for example 0.42 for 42%',
    },
  );
}
