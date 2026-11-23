'use client';

import { RenderFields, useDocumentInfo, useFormFields } from '@payloadcms/ui';
import type {
  ClientField,
  DateFieldClient,
  SanitizedFieldPermissions,
  SanitizedFieldsPermissions,
} from 'payload';

import { isShortDate, shortDateDisplayFormat } from '../../fields/shortDate.js';
import { usePanelLayout } from './PanelConfig.client.js';

function permissionsAt(
  fields: SanitizedFieldsPermissions | undefined,
  parentPath: string,
): SanitizedFieldsPermissions | undefined {
  if (!parentPath || fields === true || fields === undefined) return fields;

  return parentPath.split('.').reduce<SanitizedFieldsPermissions | undefined>((current, name) => {
    if (current === true || current === undefined) return current;
    const field = current[name] as SanitizedFieldPermissions | undefined;

    return field === true ? true : (field?.fields ?? (field ? true : undefined));
  }, fields);
}

function useShortDate(field: ClientField, path: string): ClientField {
  const value = useFormFields(([fields]) => (field.type === 'date' ? fields[path]?.value : null));

  if (field.type !== 'date' || !isShortDate(field)) return field;

  const date: object = field.admin?.date ?? {};

  return {
    ...field,
    admin: { ...field.admin, date: { ...date, displayFormat: shortDateDisplayFormat(value) } },
  } as DateFieldClient;
}

function PanelProperty({
  field,
  parentPath,
  path,
  permissions,
  readOnly,
  slug,
}: {
  field: ClientField;
  parentPath: string;
  path: string;
  permissions: SanitizedFieldsPermissions;
  readOnly: boolean;
  slug: string;
}) {
  const shown = useShortDate(field, path);

  return (
    <RenderFields
      className="fb-record-panel-properties__row"
      fields={[shown]}
      forceRender
      parentIndexPath=""
      parentPath={parentPath}
      parentSchemaPath={[slug, parentPath].filter(Boolean).join('.')}
      permissions={permissions}
      readOnly={readOnly}
    />
  );
}

/** The panel's property list: the `properties` fields as label and value rows, in order. */
export function RecordPanelProperties() {
  const layout = usePanelLayout();
  const { docPermissions, hasSavePermission, isTrashed } = useDocumentInfo();

  if (!layout?.properties.length) return null;
  const slug = layout.collectionConfig.slug;

  return (
    <div className="fb-record-panel-properties">
      {layout.properties.map(({ field, parentPath, path }) => (
        <PanelProperty
          field={field}
          key={path}
          parentPath={parentPath}
          path={path}
          permissions={permissionsAt(docPermissions?.fields, parentPath) ?? {}}
          readOnly={!hasSavePermission || Boolean(isTrashed)}
          slug={slug}
        />
      ))}
    </div>
  );
}
