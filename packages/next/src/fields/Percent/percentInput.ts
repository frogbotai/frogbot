const decimalPattern = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/;
const inputPattern = /^([+-]?)(\d*)(?:\.(\d*))?\s*%?$/;
const readablePattern = /^[+-]?(\d+(\.\d*)?|\.\d+)\s*%?$/;

function placePoint({ digits, point }: { digits: string; point: number }): string {
  const placed =
    point <= 0
      ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length
        ? `${digits}${'0'.repeat(point - digits.length)}`
        : `${digits.slice(0, point)}.${digits.slice(point)}`;

  const trimmed = placed.includes('.') ? placed.replace(/\.?0+$/, '') : placed;

  return trimmed.replace(/^0+(?=\d)/, '');
}

export function percentToInput(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';

  const match = decimalPattern.exec(String(Math.abs(value)));

  if (!match) return '';

  const [, whole, fraction = '', exponent = '0'] = match;

  const shifted = placePoint({
    digits: `${whole}${fraction}`,
    point: whole.length + Number(exponent) + 2,
  });

  return value < 0 && shifted !== '0' ? `-${shifted}` : shifted;
}

export function parsePercentInput(text: string): number | null | undefined {
  const trimmed = text.trim();

  if (trimmed === '') return null;

  const match = readablePattern.test(trimmed) ? inputPattern.exec(trimmed) : null;

  if (!match) return undefined;

  const [, sign, whole, fraction = ''] = match;

  const parsed = Number(
    `${sign}${placePoint({ digits: `${whole || '0'}${fraction}`, point: (whole || '0').length - 2 })}`,
  );

  return parsed === 0 ? 0 : parsed;
}
