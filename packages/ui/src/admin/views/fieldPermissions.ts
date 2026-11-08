import type { SanitizedFieldsPermissions } from 'payload';

/** Whether field permissions allow updating the field at a dot path, and every group above it. */
export function canUpdateField(
  fields: SanitizedFieldsPermissions | undefined,
  path: string,
): boolean {
  let permissions = fields;

  for (const key of path.split('.')) {
    if (permissions === true) return true;
    const permission = permissions?.[key];
    if (permission === true) return true;
    if (!permission?.update) return false;
    permissions = permission.fields;
  }

  return true;
}
