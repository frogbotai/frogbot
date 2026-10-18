'use client';

import {
  DefaultListView as PayloadDefaultListView,
  useAuth,
  useConfig,
  useListDrawerContext,
} from '@payloadcms/ui';
import type { ListViewClientProps } from 'payload';

import { aiBulkMenuFields } from '../../fields/AI/bulk.js';
import { AIFieldListMenuItem } from '../../fields/AI/ListMenuItem.client.js';

/** Payload's list view, with a bulk menu item for each AI field the user can run. */
export function DefaultListView(props: ListViewClientProps) {
  const { collectionSlug, listMenuItems, viewType } = props;
  const { getEntityConfig } = useConfig();
  const { isInDrawer } = useListDrawerContext();
  const { permissions } = useAuth();
  const collectionConfig = getEntityConfig({ collectionSlug });

  const aiFields = aiBulkMenuFields({
    canUpdate: Boolean(permissions?.collections?.[collectionSlug]?.update),
    fields: collectionConfig.fields,
    isInDrawer: Boolean(isInDrawer),
    viewType,
  });

  if (aiFields.length === 0) return <PayloadDefaultListView {...props} />;

  return (
    <PayloadDefaultListView
      {...props}
      listMenuItems={[
        ...(listMenuItems ?? []),
        ...aiFields.map((field) => (
          <AIFieldListMenuItem
            collectionSlug={collectionSlug}
            field={field}
            key={`ai-bulk-${field.name}`}
          />
        )),
      ]}
    />
  );
}
