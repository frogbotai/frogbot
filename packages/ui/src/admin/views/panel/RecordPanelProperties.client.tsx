'use client';

import { RenderFields, useDocumentInfo } from '@payloadcms/ui';
import type { SanitizedFieldPermissions, SanitizedFieldsPermissions } from 'payload';

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

/** The panel's property list: the `properties` fields as label and value rows, in order. */
export function RecordPanelProperties() {
  const layout = usePanelLayout();
  const { docPermissions, hasSavePermission, isTrashed } = useDocumentInfo();

  if (!layout?.properties.length) return null;
  const slug = layout.collectionConfig.slug;

  return (
    <div className="fb-record-panel-properties">
      {layout.properties.map(({ field, parentPath, path }) => (
        <RenderFields
          className="fb-record-panel-properties__row"
          fields={[field]}
          forceRender
          key={path}
          parentIndexPath=""
          parentPath={parentPath}
          parentSchemaPath={[slug, parentPath].filter(Boolean).join('.')}
          permissions={permissionsAt(docPermissions?.fields, parentPath) ?? {}}
          readOnly={!hasSavePermission || isTrashed}
        />
      ))}
    </div>
  );
}
