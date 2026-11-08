'use client';

import { toast, useConfig, useModal } from '@payloadcms/ui';
import type { PopulateType } from 'payload';
import { formatAdminURL } from 'payload/shared';
import { useState } from 'react';

import { appendQuery, setPath } from '../cells.js';

/** Whether the drawer with this slug is open, so its record shows as selected. */
export function useDrawerSelected(drawerSlug: string): boolean {
  const { isModalOpen } = useModal();

  return isModalOpen(drawerSlug);
}

/**
 * Toggles a record's done checkbox with an ordinary update, so field access applies, and hands
 * the saved document back, loaded with `populate` so a card keeps its image.
 */
export function useToggleDone<T extends Record<string, unknown> & { id: number | string }>({
  collectionSlug,
  onSaved,
  populate,
  useAsDone,
}: {
  collectionSlug: string;
  onSaved: (doc: T) => void;
  populate?: PopulateType;
  useAsDone?: string;
}) {
  const { config } = useConfig();
  const [saving, setSaving] = useState(false);

  const toggle = async (row: T, done: boolean) => {
    if (!useAsDone || saving) return;
    setSaving(true);
    const params = new URLSearchParams({ depth: '1' });

    appendQuery(params, 'populate', populate);

    try {
      const response = await fetch(
        formatAdminURL({
          apiRoute: config.routes.api,
          path: `/${collectionSlug}/${row.id}?${params}`,
        }),
        {
          body: JSON.stringify(setPath(useAsDone, done)),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        },
      );

      const result = (await response.json().catch(() => ({}))) as {
        doc?: T;
        errors?: { message?: string }[];
      };

      if (!response.ok || !result.doc) {
        throw new Error(result.errors?.[0]?.message ?? response.statusText);
      }

      onSaved(result.doc);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the record');
    } finally {
      setSaving(false);
    }
  };

  return { saving, toggle };
}
