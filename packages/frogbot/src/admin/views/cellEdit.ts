/** The Payload field types a list cell edits in place, when they hold one value. */
export const CELL_EDIT_FIELD_TYPES = [
  'checkbox',
  'date',
  'email',
  'number',
  'relationship',
  'select',
  'text',
  'textarea',
] as const;

const NEVER_IN_CELL = new Set([
  'array',
  'blocks',
  'collapsible',
  'group',
  'join',
  'richText',
  'row',
  'tab',
  'tabs',
  'ui',
  'upload',
]);

const GENERATED_KINDS = new Set(['autonumber']);

type CellField = {
  admin?: { custom?: Record<string, unknown> };
  hasMany?: boolean;
  type: string;
};

/** The FrogBot field kind a field was built with, such as `money`, or `undefined`. */
export function getFieldKindType(field: Pick<CellField, 'admin'>): string | undefined {
  const kind = (field.admin?.custom?.frogbot as { kind?: { type?: unknown } } | undefined)?.kind;

  return typeof kind?.type === 'string' ? kind.type : undefined;
}

/**
 * How a list cell edits a field, by its config alone: `edit` in the cell, `panel` by opening the
 * record, or `never` for fields that can't be named in a list view's `editable`. Access,
 * `admin.readOnly` and virtual fields are checked per request.
 */
export function getCellEditMode(field: CellField): 'edit' | 'never' | 'panel' {
  const kind = getFieldKindType(field);

  if (NEVER_IN_CELL.has(field.type) || (kind && GENERATED_KINDS.has(kind))) return 'never';
  if (field.hasMany) return 'panel';
  if (kind) return 'edit';

  return (CELL_EDIT_FIELD_TYPES as readonly string[]).includes(field.type) ? 'edit' : 'panel';
}
