import type {
  Field,
  SanitizedCollectionConfig,
  SanitizedCollectionPermission,
  SanitizedFieldsPermissions,
} from 'payload';
import {
  fieldAffectsData,
  fieldHasSubFields,
  fieldIsVirtual,
  flattenTopLevelFields,
  tabHasName,
} from 'payload/shared';

import { resolveBoardField } from './resolveColumns.js';

/** How a board's "+ Add" creates a card: inline by title, or through the prefilled create form. */
export type BoardInlineAdd = {
  /** Uncategorized opens the form even when `inline` is on, because the group field is required. */
  groupRequired: boolean;
  inline: boolean;
};

function hasBlockingField(fields: Field[], skip: Set<string>, prefix = ''): boolean {
  return fields.some((field) => {
    if (field.type === 'tabs') {
      return field.tabs.some((tab) =>
        tabHasName(tab)
          ? hasBlockingField(tab.fields, skip, `${prefix}${tab.name}.`)
          : hasBlockingField(tab.fields, skip, prefix),
      );
    }

    if (!fieldAffectsData(field)) {
      return fieldHasSubFields(field) && hasBlockingField(field.fields, skip, prefix);
    }

    const path = `${prefix}${field.name}`;

    if (field.type === 'group') return hasBlockingField(field.fields, skip, `${path}.`);

    return (
      !skip.has(path) &&
      !fieldIsVirtual(field) &&
      'required' in field &&
      field.required === true &&
      field.defaultValue === undefined &&
      !field.hooks?.beforeValidate?.length
    );
  });
}

function canCreate(fields: SanitizedFieldsPermissions | undefined, path: string[]): boolean {
  if (fields === undefined || fields === true) return true;

  const [name, ...rest] = path;
  const permission = fields[name];

  if (permission === true) return true;
  if (!permission?.create) return false;

  return rest.length === 0 || canCreate(permission.fields, rest);
}

/**
 * Decides on the server, where defaults and hooks are visible, whether "+ Add" can save a card
 * from its title alone. Collection hooks and custom `validate` functions can't be read, so a save
 * can still fail; the card then offers the form.
 */
export function getInlineAdd({
  collectionConfig,
  groupBy,
  permissions,
}: {
  collectionConfig: SanitizedCollectionConfig;
  groupBy: string;
  permissions?: SanitizedCollectionPermission;
}): BoardInlineAdd {
  const groupField = resolveBoardField(collectionConfig.fields, groupBy);
  const groupRequired = Boolean(
    groupField && 'required' in groupField && groupField.required === true,
  );

  const useAsTitle = collectionConfig.admin.useAsTitle;
  if (!useAsTitle || useAsTitle === 'id') return { groupRequired, inline: false };

  const title = (flattenTopLevelFields(collectionConfig.fields) as Field[]).find(
    (field) => fieldAffectsData(field) && field.name === useAsTitle,
  );

  const local = Boolean(collectionConfig.auth) && !collectionConfig.auth.disableLocalStrategy;

  const inline =
    (title?.type === 'text' || title?.type === 'textarea') &&
    !fieldIsVirtual(title) &&
    canCreate(permissions?.fields, [useAsTitle]) &&
    canCreate(permissions?.fields, groupBy.split('.')) &&
    !collectionConfig.upload &&
    !local &&
    !hasBlockingField(collectionConfig.fields, new Set([useAsTitle, groupBy]));

  return { groupRequired, inline };
}
