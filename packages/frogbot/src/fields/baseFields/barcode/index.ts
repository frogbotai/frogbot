import type { TextField } from '../../config/types.js';
import { acceptAnyValue, applyFieldKind } from '../applyFieldKind.js';
import { rejectFieldOptions } from '../rejectFieldOptions.js';

export type BarcodeFieldArgs = Omit<
  Extract<TextField, { hasMany?: false | undefined }>,
  'type' | 'hasMany' | 'minRows' | 'maxRows'
>;

export function barcodeField(args: BarcodeFieldArgs): TextField {
  rejectFieldOptions({
    factory: 'barcodeField',
    field: args,
    keys: ['hasMany', 'minRows', 'maxRows'],
  });

  return applyFieldKind(
    { ...args, type: 'text' },
    {
      kind: { type: 'barcode' },
      cell: true,
      check: acceptAnyValue,
      description: 'Barcode value as text, for example a UPC or EAN code',
    },
  );
}
