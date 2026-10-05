import type { NumberField } from '../../config/types.js';
import { applyFieldKind } from '../applyFieldKind.js';
import { describeOptionValue, rejectFieldOptions } from '../rejectFieldOptions.js';
import type { DurationFormat } from './formatDuration.js';

export type DurationFieldArgs = Omit<
  Extract<NumberField, { hasMany?: false | undefined }>,
  'type' | 'hasMany' | 'minRows' | 'maxRows'
> & {
  format?: DurationFormat;
};

export function durationField(args: DurationFieldArgs): NumberField {
  const { format = 'h:mm:ss', ...rest } = args;

  rejectFieldOptions({
    factory: 'durationField',
    field: args,
    keys: ['hasMany', 'minRows', 'maxRows'],
  });

  if (format !== 'h:mm' && format !== 'h:mm:ss') {
    throw new Error(
      `durationField "${args.name}": format must be "h:mm" or "h:mm:ss", got ${describeOptionValue(format)}`,
    );
  }

  return applyFieldKind(
    { ...rest, type: 'number' },
    {
      kind: { type: 'duration', format },
      cell: true,
      Field: '@frogbotai/next/client#DurationField',
      check: (value) => (Number.isInteger(value) ? true : 'Enter a duration in whole seconds.'),
      description: 'Duration in whole seconds, for example 5400 for 1 hour 30 minutes',
      integer: true,
    },
  );
}
