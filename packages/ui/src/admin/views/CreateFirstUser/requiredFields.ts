import type { ClientField } from 'payload';

const authFieldNames = new Set(['email', 'username', 'password']);

/**
 * The fields the first-user form asks for besides email and password: every field marked
 * `required`, inside the rows, collapsibles, groups and tabs that hold one, with their optional
 * siblings left out.
 */
export function requiredFields(fields: ClientField[], topLevel = true): ClientField[] {
  return fields.flatMap((field): ClientField[] => {
    if (topLevel && 'name' in field && authFieldNames.has(field.name)) return [];

    if (field.type === 'tabs') {
      const tabs = field.tabs.flatMap((tab) => {
        const kept = requiredFields(tab.fields, false);

        return kept.length ? [{ ...tab, fields: kept }] : [];
      });

      return tabs.length ? [{ ...field, tabs }] : [];
    }

    if ('required' in field && field.required) return [field];

    if (field.type === 'row' || field.type === 'collapsible' || field.type === 'group') {
      const kept = requiredFields(field.fields, false);

      return kept.length ? [{ ...field, fields: kept }] : [];
    }

    return [];
  });
}
