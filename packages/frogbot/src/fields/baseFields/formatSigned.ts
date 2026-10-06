export function formatSigned(format: Intl.NumberFormat, value: number): string {
  const zero = format.format(0);

  return format.format(Math.abs(value)) === zero ? zero : format.format(value);
}
