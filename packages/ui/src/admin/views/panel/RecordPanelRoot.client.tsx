'use client';

import { type ReactNode, useRef } from 'react';

import { RecordPanel } from './RecordPanel.client.js';
import { RecordPanelProvider } from './RecordPanelProvider.client.js';
import { useRecordLinks } from './useRecordLinks.js';

function Links({ collectionSlug, children }: { children: ReactNode; collectionSlug: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useRecordLinks({ collectionSlug, viewRef: ref });

  return (
    <>
      <div className="fb-record-panel-root" ref={ref}>
        {children}
      </div>
      <RecordPanel viewRef={ref} />
    </>
  );
}

/** The record panel around a custom view that renders without the shared frame. */
export function RecordPanelRoot({
  children,
  collectionSlug,
}: {
  children: ReactNode;
  collectionSlug: string;
}) {
  return (
    <RecordPanelProvider collectionSlug={collectionSlug}>
      <Links collectionSlug={collectionSlug}>{children}</Links>
    </RecordPanelProvider>
  );
}
