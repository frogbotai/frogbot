import type { TextField } from '../../config/types.js';
import { applyFieldKind } from '../applyFieldKind.js';
import { describeOptionValue, rejectFieldOptions } from '../rejectFieldOptions.js';
import { type ColorKind, getHexColor } from './getHexColor.js';

export type ColorFieldArgs = Omit<
  Extract<TextField, { hasMany?: false | undefined }>,
  'type' | 'hasMany' | 'minRows' | 'maxRows' | 'minLength' | 'maxLength'
> & {
  /** Colors the picker offers as one-click swatches, as `#rgb` or `#rrggbb`. `[]` shows none. */
  swatches?: string[];
};

const defaultSwatches = [
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
];

function readSwatches(name: string, swatches: string[]): string[] {
  return swatches.map((swatch) => {
    const color = getHexColor({ value: swatch });

    if (!color) {
      throw new Error(
        `colorField "${name}": swatch ${describeOptionValue(swatch)} is not a #rgb or #rrggbb color`,
      );
    }

    return color;
  });
}

export function colorField({ swatches = defaultSwatches, ...args }: ColorFieldArgs): TextField {
  rejectFieldOptions({
    factory: 'colorField',
    field: args,
    keys: ['hasMany', 'minRows', 'maxRows', 'minLength', 'maxLength'],
  });

  const kind: ColorKind = { type: 'color', swatches: readSwatches(args.name, swatches) };

  return applyFieldKind(
    { ...args, type: 'text' },
    {
      kind,
      cell: true,
      Field: '@frogbotai/ui/admin#ColorField',
      check: (value) => (getHexColor({ value }) ? true : 'Enter a hex color such as #3b82f6.'),
      description: 'Hex color as #rrggbb or #rgb, for example #3b82f6',
    },
  );
}
