import type { Field } from 'frogbot';

export function mergeFields(...groups: (Field[] | undefined)[]): Field[] {
  const fields = new Map<string, Field>();
  for (const group of groups) {
    for (const field of group ?? []) {
      const key = 'name' in field && field.name ? field.name : JSON.stringify(field);
      fields.set(key, field);
    }
  }
  return [...fields.values()];
}
