'use client';

import { getTranslation } from '@payloadcms/translations';
import { PopupList, useConfig, useListQuery, useSelection, useTranslation } from '@payloadcms/ui';
import { useRouter } from 'next/navigation.js';
import { type ReactNode, useState } from 'react';

import { type AIBulkField, type AIBulkScope, aiBulkScope } from './bulk.js';
import { AIBulkDialog } from './BulkDialog.client.js';

export function AIFieldListMenuItem({
  collectionSlug,
  field,
}: {
  collectionSlug: string;
  field: AIBulkField;
}): ReactNode {
  const { getEntityConfig } = useConfig();
  const { query } = useListQuery();
  const { selectAll, selectedIDs, toggleAll } = useSelection();
  const { i18n } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<AIBulkScope>();

  const openDialog = () => {
    const collectionConfig = getEntityConfig({ collectionSlug });

    setScope(aiBulkScope({ collectionConfig, query, selectAll, selectedIDs }));
    setOpen(true);
  };

  const done = () => {
    if (scope?.hasSelection) toggleAll();

    router.refresh();
  };

  return (
    <>
      <PopupList.Button onClick={openDialog}>
        Regenerate {getTranslation(field.label || field.name, i18n)}…
      </PopupList.Button>
      {scope && (
        <AIBulkDialog
          collectionSlug={collectionSlug}
          field={field}
          onDone={done}
          onOpenChange={setOpen}
          open={open}
          scope={scope}
        />
      )}
    </>
  );
}
