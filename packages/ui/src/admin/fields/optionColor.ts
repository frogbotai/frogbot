import type { OptionColor } from 'frogbot';
import type { ClientField, Field, FlattenedField } from 'payload';

export function getOptionColors(
  field: ClientField | Field | FlattenedField,
): Record<string, OptionColor> | undefined {
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
  return pickOptionColor(getOptionColors(field), value);
}

/** Looks a value up in a field's option colors; an unlisted value is gray. */
export function pickOptionColor(
  optionColors: Record<string, OptionColor> | undefined,
  value: unknown,
): OptionColor | undefined {
  if (!optionColors) return undefined;

  const key = String(value);

  return Object.hasOwn(optionColors, key) ? optionColors[key] : 'gray';
}
