import type { SanitizedFieldPermissions, SanitizedFieldsPermissions } from 'payload';

/** Whether field permissions allow updating the field at a dot path. */
export function canUpdateField(
  fields: SanitizedFieldsPermissions | undefined,
  path: string,
): boolean {
  let fieldPermission: SanitizedFieldPermissions | undefined;
  let fieldPermissions = fields;

  for (const key of path.split('.')) {
    if (!fieldPermissions || fieldPermissions === true) {
      fieldPermission = fieldPermissions;
      break;
    }

    fieldPermission = fieldPermissions[key];
    fieldPermissions = fieldPermission === true ? true : fieldPermission?.fields;
  }

  return fieldPermission === true || Boolean(fieldPermission?.update);
}
