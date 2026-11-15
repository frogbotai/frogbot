import { getTranslation, type I18nClient } from '@payloadcms/translations';

type Label = Parameters<typeof getTranslation>[0];

/** A field from a sanitized collection config, read loosely. */
export type ConfigField = Record<string, unknown>;

/** A changed field's label and config, keyed by its top-level data name. */
export type FieldInfo = { field: ConfigField; label: string };

/** The i18n subset the activity field reads. */
export type Translator = Pick<I18nClient, 'fallbackLanguage' | 'language' | 't'> | undefined;

/** Related records' titles, keyed by `<collection>:<id>`. */
export type Titles = Map<string, string>;

type Ref = { collection: string; id: number | string };

const MAX_LENGTH = 80;
const relationTypes = new Set(['relationship', 'upload']);
const textTypes = new Set(['date', 'email', 'number', 'text']);
const choiceTypes = new Set(['radio', 'select']);

export function translate(label: unknown, i18n: Translator): string | undefined {
  if (typeof label === 'string') return label;
  if (!i18n || !label || (typeof label !== 'object' && typeof label !== 'function')) {
    return undefined;
  }

  const text: unknown = getTranslation(label as Label, i18n as I18nClient);

  return typeof text === 'string' && text ? text : undefined;
}

function startCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (first) => first.toUpperCase());
}

function childFields(field: ConfigField): ConfigField[] {
  if (Array.isArray(field.tabs)) {
    return (field.tabs as ConfigField[]).flatMap((tab) =>
      typeof tab.name === 'string' ? [tab] : childFields(tab),
    );
  }

  return Array.isArray(field.fields) ? (field.fields as ConfigField[]) : [];
}

/** Maps each top-level data name, including those inside rows, collapsibles and unnamed tabs. */
export function fieldInfo(
  fields: ConfigField[],
  i18n: Translator,
  info = new Map<string, FieldInfo>(),
): Map<string, FieldInfo> {
  for (const field of fields) {
    if (typeof field.name === 'string') {
      info.set(field.name, {
        field,
        label: translate(field.label, i18n) ?? startCase(field.name),
      });
    } else {
      fieldInfo(childFields(field), i18n, info);
    }
  }

  return info;
}

function list(value: unknown): unknown[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (item) => item !== null && item !== undefined && item !== '',
  );
}

function isId(value: unknown): value is number | string {
  return typeof value === 'number' || (typeof value === 'string' && value !== '');
}

function refOf(field: ConfigField, value: unknown): Ref | undefined {
  if (typeof field.relationTo === 'string') {
    const id = value && typeof value === 'object' && 'id' in value ? value.id : value;

    return isId(id) ? { collection: field.relationTo, id } : undefined;
  }

  if (!value || typeof value !== 'object' || !('relationTo' in value) || !('value' in value)) {
    return undefined;
  }

  const { relationTo, value: target } = value;
  const id = target && typeof target === 'object' && 'id' in target ? target.id : target;

  return typeof relationTo === 'string' && isId(id) ? { collection: relationTo, id } : undefined;
}

/** Collects the related records each relationship or upload change points at, per collection. */
export function relatedIds(
  changes: Array<Record<string, unknown> | undefined>,
  info: Map<string, FieldInfo>,
): Map<string, Set<number | string>> {
  const ids = new Map<string, Set<number | string>>();

  for (const change of changes) {
    for (const [key, diff] of Object.entries(change ?? {})) {
      const field = info.get(key)?.field;
      if (!field || !relationTypes.has(String(field.type))) continue;

      const { new: next, old } = (diff ?? {}) as { new?: unknown; old?: unknown };

      for (const value of [...list(old), ...list(next)]) {
        const ref = refOf(field, value);
        if (ref) ids.set(ref.collection, (ids.get(ref.collection) ?? new Set()).add(ref.id));
      }
    }
  }

  return ids;
}

/** The record's title: its collection's `useAsTitle`, then `name`, `title` or `email`. */
export function titleOf(doc: Record<string, unknown>, titleKey: string | undefined) {
  for (const key of [titleKey, 'name', 'title', 'email']) {
    const value = key && key !== 'id' ? doc[key] : undefined;
    if (typeof value === 'string' && value) return value;
    if (key === titleKey && typeof value === 'number') return String(value);
  }

  return undefined;
}

function optionLabel(field: ConfigField, value: unknown, i18n: Translator): string {
  const options = Array.isArray(field.options) ? (field.options as unknown[]) : [];

  for (const option of options) {
    if (option === value) return String(value);
    if (option && typeof option === 'object' && 'value' in option && option.value === value) {
      return 'label' in option ? (translate(option.label, i18n) ?? String(value)) : String(value);
    }
  }

  return String(value);
}

function scalar(
  field: ConfigField,
  value: unknown,
  titles: Titles,
  i18n: Translator,
  dates: Intl.DateTimeFormat,
): string | undefined {
  const type = String(field.type);

  if (relationTypes.has(type)) {
    const ref = refOf(field, value);

    return ref && (titles.get(`${ref.collection}:${ref.id}`) ?? `#${ref.id}`);
  }

  if (choiceTypes.has(type)) return optionLabel(field, value, i18n);

  if (type === 'date' && typeof value === 'string') {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? value : dates.format(date);
  }

  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function clip(text: string): string {
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;
}

/** Whether a date field's picker includes a time. */
export function showsTime(field: ConfigField): boolean {
  const admin = field.admin as { date?: { pickerAppearance?: string } } | undefined;
  const appearance = admin?.date?.pickerAppearance;

  return appearance === 'dayAndTime' || appearance === 'timeOnly';
}

/**
 * Renders one side of a change for a field whose values read well inline: options by label,
 * related records by title, plus text, numbers, dates and checkboxes. Returns `undefined` for
 * any other field (rich text, groups, arrays, JSON), whose change is only named.
 */
export function formatValue(
  field: ConfigField,
  value: unknown,
  titles: Titles,
  i18n: Translator,
  dates: Intl.DateTimeFormat,
): string | undefined {
  const type = String(field.type);

  if (type === 'checkbox') return value === true ? 'Yes' : 'No';
  if (!relationTypes.has(type) && !choiceTypes.has(type) && !textTypes.has(type)) return undefined;

  const parts = list(value).map((item) => scalar(field, item, titles, i18n, dates));
  if (parts.some((part) => part === undefined)) return undefined;

  return parts.length ? clip(parts.join(', ')) : 'None';
}
