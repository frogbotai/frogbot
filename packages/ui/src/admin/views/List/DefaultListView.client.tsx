'use client';

import {
  DefaultListView as PayloadDefaultListView,
  useAuth,
  useConfig,
  useListDrawerContext,
} from '@payloadcms/ui';
import type { ListViewClientProps } from 'payload';
import type { ReactNode } from 'react';

import { aiBulkMenuFields } from '../../fields/AI/bulk.js';
import { AIFieldListMenuItem } from '../../fields/AI/ListMenuItem.client.js';

/** The list page's FrogBot slots. A relationship drawer ignores them and stays Payload's own. */
export type ListPageSlots = {
  beforeActions?: ReactNode[];
  hideCreateNew?: boolean;
  NoResults?: ReactNode;
};

export type DefaultListViewProps = ListViewClientProps & { pageSlots?: ListPageSlots };

/** Payload's list view, with a bulk menu item for each AI field the user can run. */
export function DefaultListView({ pageSlots, ...listProps }: DefaultListViewProps) {
  const { collectionSlug, listMenuItems, viewType } = listProps;
  const { getEntityConfig } = useConfig();
  const { isInDrawer } = useListDrawerContext();
  const { permissions } = useAuth();
  const collectionConfig = getEntityConfig({ collectionSlug });
  const props: ListViewClientProps =
    pageSlots && !isInDrawer
      ? {
          ...listProps,
          ...(pageSlots.beforeActions ? { beforeActions: pageSlots.beforeActions } : {}),
          ...(pageSlots.hideCreateNew ? { newDocumentURL: '' } : {}),
          ...(pageSlots.NoResults ? { NoResults: pageSlots.NoResults } : {}),
        }
      : listProps;

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
