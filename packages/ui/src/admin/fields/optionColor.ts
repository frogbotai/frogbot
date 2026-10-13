import type { OptionColor } from 'frogbot';
import type { ClientField, Field } from 'payload';

function getOptionColors(field: ClientField | Field): Record<string, OptionColor> | undefined {
  const optionColors: unknown = field.admin?.custom?.frogbot?.optionColors;

  if (!optionColors || typeof optionColors !== 'object') return undefined;

  return optionColors as Record<string, OptionColor>;
}

export function hasOptionColors(field: ClientField | Field): boolean {
  return getOptionColors(field) !== undefined;
}

export function getOptionColor({
  field,
  value,
}: {
  field: ClientField | Field;
  value: unknown;
}): OptionColor | undefined {
  const optionColors = getOptionColors(field);

  if (!optionColors) return undefined;

  const key = String(value);

  return Object.hasOwn(optionColors, key) ? optionColors[key] : 'gray';
}
