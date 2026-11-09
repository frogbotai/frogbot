import { getCellEditMode } from 'frogbot/internal';
import type { SanitizedCollectionPermission } from 'payload';

import { canUpdateField } from '../../fieldPermissions.js';
import { type AnyField, type FieldLookup, readField, resolveFieldAtPath } from './fieldPath.js';

function isPlain(field: FieldLookup): boolean {
  const { admin, hidden, virtual } = field;
  const disabled =
    admin?.disabled === true ||
    (typeof admin?.disabled === 'object' && admin.disabled.field === true);

  return Boolean(hidden || admin?.hidden || disabled || admin?.readOnly || virtual);
}

/**
 * The list columns a person can edit in place: those the view's `editable` names (every column
 * for `true`) whose field edits in a cell, isn't read-only, hidden, disabled, virtual or the draft
 * status, and that the person may update. Every other cell stays as it is and opens the record.
 */
export function getEditableColumns({
  columns,
  editable,
  fields,
  permissions,
}: {
  columns: string[];
  editable: boolean | string[] | undefined;
  fields: readonly AnyField[];
  permissions: SanitizedCollectionPermission | undefined;
}): string[] {
  if (!editable || !permissions?.update) return [];

  const named = editable === true ? undefined : new Set(editable);

  return columns.filter((path) => {
    if (path === '_status' || (named && !named.has(path))) return false;

    const found = resolveFieldAtPath(fields, path);

    if (!found || isPlain(readField(found.field)) || found.parents.some(isPlain)) return false;

    return getCellEditMode(found.field) === 'edit' && canUpdateField(permissions.fields, path);
  });
}
