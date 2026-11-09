/** Any field, server or client: only its type is required. */
export type AnyField = { type: string };

/** The parts of a field the cell-edit rule reads. */
export type FieldLookup = {
  admin?: { disabled?: boolean; hidden?: boolean; readOnly?: boolean };
  fields?: AnyField[];
  hidden?: boolean;
  name?: string;
  tabs?: Array<{ fields: AnyField[]; name?: string }>;
  virtual?: boolean | string;
};

/** Reads the optional parts of a field without narrowing it by type. */
export function readField(field: AnyField): FieldLookup {
  return field as FieldLookup;
}

type Step<TField> = ({ field: TField } | { tab: { fields: AnyField[]; name: string } }) & {
  containers: FieldLookup[];
};

/**
 * A field found by dot path. `parents` are the groups and tabs above it, named ones with a
 * `name` that is part of the path, and the rows, collapsibles and unnamed tabs it sits in.
 */
export type FieldAtPath<TField> = { field: TField; parents: FieldLookup[] };

function findStep<TField extends AnyField>(
  fields: readonly TField[],
  name: string,
): Step<TField> | undefined {
  for (const field of fields) {
    const lookup = readField(field);
    const { fields: children, name: fieldName, tabs } = lookup;

    if (fieldName === name) return { containers: [], field };

    for (const tab of field.type === 'tabs' ? (tabs ?? []) : []) {
      if (tab.name === name) return { containers: [lookup], tab: { fields: tab.fields, name } };

      const found = tab.name ? undefined : findStep(tab.fields as TField[], name);

      if (found) return { ...found, containers: [lookup, tab, ...found.containers] };
    }

    const found = !fieldName && children ? findStep(children as TField[], name) : undefined;

    if (found) return { ...found, containers: [lookup, ...found.containers] };
  }

  return undefined;
}

/** The field at a dot path through groups and named tabs, or `undefined`. */
export function resolveFieldAtPath<TField extends AnyField>(
  fields: readonly TField[],
  path: string,
): FieldAtPath<TField> | undefined {
  const [name, ...rest] = path.split('.');
  const step = findStep(fields, name);

  if (!step) return undefined;

  if (rest.length === 0) {
    return 'field' in step ? { field: step.field, parents: step.containers } : undefined;
  }

  const parent =
    'tab' in step
      ? step.tab
      : step.field.type === 'group'
        ? { ...readField(step.field), name }
        : undefined;

  const inner = parent?.fields && resolveFieldAtPath(parent.fields as TField[], rest.join('.'));

  return inner
    ? { field: inner.field, parents: [...step.containers, parent, ...inner.parents] }
    : undefined;
}
