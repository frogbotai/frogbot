'use client';

import { toast, useConfig } from '@payloadcms/ui';
import { formatAdminURL } from 'payload/shared';
import { useState } from 'react';

import { setPath } from '../cells.js';

/**
 * Toggles a record's done checkbox with an ordinary update, so field access applies, and hands
 * the saved document back.
 */
export function useToggleDone<T extends Record<string, unknown> & { id: number | string }>({
  collectionSlug,
  onSaved,
  useAsDone,
}: {
  collectionSlug: string;
  onSaved: (doc: T) => void;
  useAsDone?: string;
}) {
  const { config } = useConfig();
  const [saving, setSaving] = useState(false);

  const toggle = async (row: T, done: boolean) => {
    if (!useAsDone || saving) return;
    setSaving(true);

    try {
      const response = await fetch(
        formatAdminURL({
          apiRoute: config.routes.api,
          path: `/${collectionSlug}/${row.id}?depth=1`,
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
