import type { TextField } from '../../config/types.js';
import { applyFieldKind } from '../applyFieldKind.js';
import { rejectFieldOptions } from '../rejectFieldOptions.js';
import { getPhoneHref } from './formatPhone.js';

export type PhoneFieldArgs = Omit<
  Extract<TextField, { hasMany?: false | undefined }>,
  'type' | 'hasMany' | 'minRows' | 'maxRows'
>;

export function phoneField(args: PhoneFieldArgs): TextField {
  rejectFieldOptions({
    factory: 'phoneField',
    field: args,
    keys: ['hasMany', 'minRows', 'maxRows'],
  });

  return applyFieldKind(
    { ...args, type: 'text' },
    {
      kind: { type: 'phone' },
      cell: true,
      Field: '@frogbotai/next/client#PhoneField',
      check: (value) =>
        getPhoneHref({ value }) ? true : 'Enter a phone number with 7 to 15 digits.',
      description: 'Phone number as text, for example +44 20 7946 0958 or (415) 555-9876',
    },
  );
}
