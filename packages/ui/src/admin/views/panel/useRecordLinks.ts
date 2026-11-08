'use client';

import { useConfig } from '@payloadcms/ui';
import { type RefObject, useEffect, useRef } from 'react';

import { useRecordPanel } from './RecordPanelProvider.client.js';

const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="button"], [role="checkbox"], [contenteditable="true"], .popup';

function rowRecordId(row: HTMLElement): string | undefined {
  return row.dataset.id ?? row.querySelector<HTMLElement>('[data-row-id]')?.dataset.rowId;
}

/**
 * Opens records in the panel from the view's own markup: a plain click on a link to a record's
 * edit page, or on a list row away from its controls. Cmd, Ctrl, Shift and middle clicks keep
 * the link's own behavior, so they open the full page in a new tab.
 */
export function useRecordLinks({
  collectionSlug,
  viewRef,
}: {
  collectionSlug: string;
  viewRef: RefObject<HTMLElement | null>;
}): void {
  const { config, getEntityConfig } = useConfig();
  const panel = useRecordPanel();
  const panelRef = useRef(panel);
  const adminRoute = config.routes.admin;
  const views = (
    getEntityConfig({ collectionSlug }).admin?.custom?.frogbot as
      { views?: Array<{ slug: string }> } | undefined
  )?.views;

  const reserved = new Set(['create', 'trash', ...(views ?? []).map(({ slug }) => slug)]);
  const reservedKey = [...reserved].join('\n');

  useEffect(() => {
    panelRef.current = panel;
  });

  useEffect(() => {
    if (!panel.enabled) return;
    const prefix = `${adminRoute.replace(/\/$/, '')}/collections/${collectionSlug}/`;
    const skip = new Set(reservedKey.split('\n'));

    const recordFromLink = (anchor: HTMLAnchorElement): string | undefined => {
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith(prefix)) return;
      const rest = decodeURIComponent(url.pathname.slice(prefix.length));

      return rest && !rest.includes('/') && !skip.has(rest) ? rest : undefined;
    };

    const onClick = (event: MouseEvent) => {
      const view = viewRef.current;
      const target = event.target as Element | null;
      if (!view || !target || !view.contains(target) || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = target.closest<HTMLAnchorElement>('a[href]');

      if (anchor) {
        const id = anchor.target && anchor.target !== '_self' ? undefined : recordFromLink(anchor);
        if (!id) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        panelRef.current.open(id);

        return;
      }

      const row = target.closest<HTMLElement>('.table tbody > tr');
      if (!row || target.closest(INTERACTIVE)) return;
      const id = rowRecordId(row);
      if (id) panelRef.current.open(id);
    };

    document.addEventListener('click', onClick, true);

    return () => document.removeEventListener('click', onClick, true);
  }, [adminRoute, collectionSlug, panel.enabled, reservedKey, viewRef]);
}
