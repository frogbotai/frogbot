'use client';

import { useConfig, useFormFields } from '@payloadcms/ui';
import type { ClientCollectionConfig } from 'payload';
import { flattenTopLevelFields, formatAdminURL } from 'payload/shared';
import { useEffect, useState } from 'react';

import { getPath } from '../cells.js';

type JoinParent = { id: string; title: string };

/** The `on` field of the collection's first join to itself, such as `parent` for subtasks. */
export function selfJoinOn(collection: ClientCollectionConfig): string | undefined {
  for (const field of flattenTopLevelFields(collection.fields)) {
    if (field.type === 'join' && field.collection === collection.slug) return field.on;
  }

  return undefined;
}

function toId(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value || undefined;

  if (typeof value === 'object' && value !== null && 'id' in value) return toId(value.id);

  return undefined;
}

/**
 * The record that the open record sits under through the collection's join to itself, such as
 * a subtask's parent task, with its title; `undefined` when there is none or it can't be read.
 */
export function useJoinParent(collection: ClientCollectionConfig): JoinParent | undefined {
  const { config } = useConfig();
  const on = selfJoinOn(collection);
  const parentId = toId(useFormFields(([fields]) => (on ? fields[on]?.value : undefined)));
  const [found, setFound] = useState<JoinParent>();
  const slug = collection.slug;
  const useAsTitle = collection.admin?.useAsTitle;
  const titleField = useAsTitle && useAsTitle !== 'id' ? useAsTitle : undefined;

  useEffect(() => {
    if (parentId === undefined) return;

    let live = true;

    void fetch(
      formatAdminURL({
        apiRoute: config.routes.api,
        path: `/${slug}/${encodeURIComponent(parentId)}?depth=0`,
      }),
      { credentials: 'include' },
    )
      .then((response) => (response.ok ? response.json() : undefined))
      .then((doc?: Record<string, unknown>) => {
        if (!live || !doc) return;

        const title = titleField ? getPath(doc, titleField) : undefined;

        setFound({
          id: parentId,
          title: typeof title === 'string' && title ? title : `#${parentId}`,
        });
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [config.routes.api, parentId, slug, titleField]);

  return found && found.id === parentId ? found : undefined;
}
