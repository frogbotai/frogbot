'use client';

import { ListQueryProvider, TableColumnsProvider, usePreferences } from '@payloadcms/ui';
import type { Column, ListQuery } from 'payload';
import { useEffect } from 'react';

import {
  CollectionViewFrame,
  type CollectionViewFrameProps,
} from './CollectionViewFrame.client.js';
import type { StoredViewPreference } from './viewSetup.js';

export type CollectionViewShellClientProps = Omit<CollectionViewFrameProps, 'enableColumns'> & {
  columnState?: Column[];
  preference?: StoredViewPreference;
  preferenceKey?: string;
  query: ListQuery;
};

/** Keeps the client's preference cache in step with a view preference the server just saved. */
export function HydrateViewPreference({
  preference,
  preferenceKey,
}: {
  preference?: StoredViewPreference;
  preferenceKey: string;
}) {
  const { syncPreference } = usePreferences();

  useEffect(() => {
    syncPreference(preferenceKey, preference);
  }, [preference, preferenceKey, syncPreference]);

  return null;
}

export function CollectionViewShellClient({
  columnState,
  preference,
  preferenceKey,
  query,
  ...frame
}: CollectionViewShellClientProps) {
  const content = (
    <>
      {preferenceKey ? (
        <HydrateViewPreference preference={preference} preferenceKey={preferenceKey} />
      ) : null}
      <CollectionViewFrame {...frame} enableColumns={Boolean(columnState)} />
    </>
  );

  return (
    <ListQueryProvider
      collectionSlug={frame.collectionSlug}
      data={undefined}
      modifySearchParams
      query={query}
    >
      {columnState ? (
        <TableColumnsProvider collectionSlug={frame.collectionSlug} columnState={columnState}>
          {content}
        </TableColumnsProvider>
      ) : (
        content
      )}
    </ListQueryProvider>
  );
}
