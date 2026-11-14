const hexColor = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;

/** What a color field keeps in `admin.custom.frogbot.kind`: the swatches its picker offers. */
export type ColorKind = {
  type: 'color';
  swatches: string[];
};

/**
 * The color a stored value names, as lowercase six-digit hex (`#3b82f6`), or `undefined` when the
 * value isn't a `#rgb` or `#rrggbb` color.
 */
export function getHexColor({ value }: { value: unknown }): string | undefined {
  if (typeof value !== 'string' || !hexColor.test(value)) return undefined;

  const digits = value.slice(1).toLowerCase();

  return digits.length === 3
    ? `#${digits
        .split('')
        .map((digit) => digit + digit)
        .join('')}`
    : `#${digits}`;
}
