import type { TextField } from '../../config/types.js';
import { applyFieldKind } from '../applyFieldKind.js';
import { rejectFieldOptions } from '../rejectFieldOptions.js';
import { getUrlHref } from './getUrlHref.js';

export type UrlFieldArgs = Omit<
  Extract<TextField, { hasMany?: false | undefined }>,
  'type' | 'hasMany' | 'minRows' | 'maxRows'
>;

export function urlField(args: UrlFieldArgs): TextField {
  rejectFieldOptions({
    factory: 'urlField',
    field: args,
    keys: ['hasMany', 'minRows', 'maxRows'],
  });

  return applyFieldKind(
    { ...args, type: 'text' },
    {
      kind: { type: 'url' },
      cell: true,
      check: (value) =>
        getUrlHref({ value }) ? true : 'Enter a web address such as https://example.com.',
      description: 'Web address, for example https://example.com or example.com',
    },
  );
}
