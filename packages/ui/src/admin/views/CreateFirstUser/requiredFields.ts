import type { ClientField } from 'payload';

/**
 * The fields the first-user form asks for besides email and password: every field marked
 * `required`, inside the rows, collapsibles, groups and tabs that hold one, with their optional
 * siblings left out. `drawn` names the top-level fields the form already draws itself.
 */
export function requiredFields(fields: ClientField[], drawn: string[] = []): ClientField[] {
  return fields.flatMap((field): ClientField[] => {
    if ('name' in field && drawn.includes(field.name)) return [];

    if (field.type === 'tabs') {
      const tabs = field.tabs.flatMap((tab) => {
        const kept = requiredFields(tab.fields);

        return kept.length ? [{ ...tab, fields: kept }] : [];
      });

      return tabs.length ? [{ ...field, tabs }] : [];
    }

    if ('required' in field && field.required) return [field];

    if (field.type === 'row' || field.type === 'collapsible' || field.type === 'group') {
      const kept = requiredFields(field.fields);

      return kept.length ? [{ ...field, fields: kept }] : [];
    }

    return [];
  });
}
