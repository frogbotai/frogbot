import type { ClientField } from 'payload';
import { fieldIsHiddenOrDisabled } from 'payload/shared';

const placeholder = (field: ClientField) =>
  ({ ...field, admin: { ...field.admin, disabled: true } }) as ClientField;

/**
 * The fields the first-user form asks for besides email and password: every visible field marked
 * `required`, inside the rows, collapsibles, groups and tabs that hold one. Each optional field
 * stays in place as a disabled placeholder, which isn't drawn, so unnamed containers keep the
 * `_index-<n>` paths the server built their form state for. `drawn` names the top-level fields the
 * form already draws itself.
 */
export function requiredFields(fields: ClientField[], drawn: string[] = []): ClientField[] {
  const kept = fields.map((field) => keepRequired(field, drawn));

  return kept.some(Boolean) ? fields.map((field, i) => kept[i] ?? placeholder(field)) : [];
}

function keepRequired(field: ClientField, drawn: string[]): ClientField | undefined {
  if (fieldIsHiddenOrDisabled(field)) return undefined;
  if ('name' in field && drawn.includes(field.name)) return undefined;

  if (field.type === 'tabs') {
    const tabs = field.tabs.map((tab) => {
      const kept = requiredFields(tab.fields);

      return kept.length ? { ...tab, fields: kept } : undefined;
    });

    const last = tabs.reduce((found, tab, i) => (tab ? i : found), -1);

    if (last === -1) return undefined;

    return {
      ...field,
      tabs: field.tabs.slice(0, last + 1).map((tab, i) => tabs[i] ?? { ...tab, fields: [] }),
    };
  }

  if ('required' in field && field.required) return field;

  if (field.type === 'row' || field.type === 'collapsible' || field.type === 'group') {
    const kept = requiredFields(field.fields);

    return kept.length ? { ...field, fields: kept } : undefined;
  }

  return undefined;
}
