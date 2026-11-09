'use client';

import { toast, useConfig, useLocale, useRouter } from '@payloadcms/ui';
import { formatAdminURL } from 'payload/shared';
import * as qs from 'qs-esm';
import { createContext, type ReactNode, use, useTransition } from 'react';

import { setPath } from '../../cells.js';
import { useRecordPanel } from '../../panel/RecordPanelProvider.client.js';

type CellToggleContext = {
  canEdit: (rowId: string, path: string) => boolean;
  save: (rowId: string, path: string, value: boolean, show: (value: boolean) => void) => void;
};

const Context = createContext<CellToggleContext | null>(null);

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errors?: { message?: string }[] };

    return body.errors?.[0]?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

/**
 * Lets a list's editable checkbox cells save in place with one click: one `PATCH` with the new
 * value, as a draft where the collection has drafts, so validation, hooks and access run as on
 * the edit page.
 */
export function CellToggleProvider({
  cells,
  children,
  collectionSlug,
  columns,
}: {
  cells?: Record<string, string[]>;
  children: ReactNode;
  collectionSlug: string;
  columns: string[];
}) {
  const { config, getEntityConfig } = useConfig();
  const locale = useLocale();
  const router = useRouter();
  const panel = useRecordPanel();
  const [, startTransition] = useTransition();
  const drafts = Boolean(getEntityConfig({ collectionSlug })?.versions?.drafts);

  const save: CellToggleContext['save'] = (rowId, path, value, show) =>
    panel.guard(() => {
      show(value);

      const query = qs.stringify(
        { depth: 0, locale: locale?.code, ...(drafts ? { draft: true } : {}) },
        { addQueryPrefix: true },
      );

      void (async () => {
        const response = await fetch(
          formatAdminURL({
            apiRoute: config.routes.api,
            path: `/${collectionSlug}/${encodeURIComponent(rowId)}${query}`,
          }),
          {
            body: JSON.stringify({
              ...setPath(path, value),
              ...(drafts ? { _status: 'draft' } : {}),
            }),
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH',
          },
        ).catch(() => undefined);

        if (!response?.ok) {
          show(!value);
          toast.error(response ? await errorMessage(response) : 'The change was not saved.');

          return;
        }

        panel.reload(rowId);

        const { pathname, search } = window.location;

        startTransition(() => router.replace(`${pathname}${search}`, { scroll: false }));
      })();
    }, rowId);

  const context: CellToggleContext = {
    canEdit: (rowId, path) =>
      columns.includes(path) && (!cells || Boolean(cells[rowId]?.includes(path))),
    save,
  };

  return <Context value={context}>{children}</Context>;
}

/**
 * Saves a checkbox cell's new value, or `undefined` when this person can't edit the cell here.
 * `show` sets the value the cell shows: the new one once any unsaved panel edits are dealt with,
 * and the old one again if the save fails.
 */
export function useCellToggle(
  rowId: string | undefined,
  path: string | undefined,
): ((value: boolean, show: (value: boolean) => void) => void) | undefined {
  const context = use(Context);

  if (!context || !rowId || !path || !context.canEdit(rowId, path)) return undefined;

  return (value, show) => context.save(rowId, path, value, show);
}
