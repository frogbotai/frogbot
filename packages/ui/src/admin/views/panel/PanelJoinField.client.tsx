'use client';

import '../records/records.css';

import { getTranslation } from '@payloadcms/translations';
import {
  toast,
  useAuth,
  useConfig,
  useDocumentInfo,
  useTranslation,
  withCondition,
} from '@payloadcms/ui';
import type { ClientField, JoinFieldClient, Where } from 'payload';
import { flattenTopLevelFields, formatAdminURL } from 'payload/shared';
import * as qs from 'qs-esm';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

import { PanelSection } from '../../elements/PanelSection/index.client.js';
import { getPath, setPath } from '../cells.js';
import { DoneCheck } from '../records/DoneCheck.client.js';
import { getUseAsDone, isRecordDone } from '../records/state.js';
import { useToggleDone } from '../records/useRecordState.js';
import { findPanelField } from './config.js';
import { usePanelLayout } from './PanelConfig.client.js';
import { useRecordPanel } from './RecordPanelProvider.client.js';

type Row = Record<string, unknown> & { id: number | string };

const DEFAULT_LIMIT = 10;

function rowTitle(row: Row, titleField: string | undefined): string {
  const value = titleField ? getPath(row, titleField) : undefined;

  return typeof value === 'string' && value ? value : `#${row.id}`;
}

function onValue(field: JoinFieldClient, collectionSlug: string, id: number | string) {
  return Array.isArray(field.targetField?.relationTo)
    ? { relationTo: collectionSlug, value: id }
    : id;
}

function initialData(
  fields: ClientField[],
  [name, ...rest]: string[],
  value: unknown,
): Record<string, unknown> | undefined {
  const field = flattenTopLevelFields(fields, { keepPresentationalFields: true }).find(
    (candidate) => 'name' in candidate && candidate.name === name,
  );

  if (!field || !('name' in field) || typeof field.name !== 'string') return undefined;

  if (field.type === 'relationship' || field.type === 'upload') {
    return { [field.name]: field.hasMany ? [value] : value };
  }

  if (!('fields' in field)) return undefined;

  const nested = initialData(field.fields, rest, value);

  if (!nested) return undefined;

  return { [field.name]: field.type === 'array' ? [nested] : nested };
}

function PanelJoinFieldComponent({ path }: { path: string }) {
  const { collectionSlug, create, notify, open } = useRecordPanel();
  const { id } = useDocumentInfo();
  const { config, getEntityConfig } = useConfig();
  const { permissions } = useAuth();
  const { i18n } = useTranslation();
  const collectionConfig =
    usePanelLayout()?.collectionConfig ?? getEntityConfig({ collectionSlug });

  const field = findPanelField(collectionConfig.fields, path)?.field as JoinFieldClient | undefined;
  const useAsDone = getUseAsDone(collectionConfig);
  const titleField = collectionConfig.admin?.useAsTitle;
  const [rows, setRows] = useState<Row[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const loadingRef = useRef(false);
  const draftRef = useRef<HTMLInputElement>(null);
  const addingRef = useRef(false);
  const drafting = draft !== undefined;

  const on = field?.on;
  const where = field?.where;
  const limit = field?.defaultLimit ?? DEFAULT_LIMIT;
  const sort = field?.defaultSort;

  const load = useCallback(
    async (pageToLoad: number) => {
      if (id === undefined || id === null || !on || !field || loadingRef.current) return;

      loadingRef.current = true;
      const filter: Where = { [on]: { equals: onValue(field, collectionSlug, id) } };
      const query = qs.stringify(
        {
          depth: 0,
          limit,
          page: pageToLoad,
          sort: Array.isArray(sort) ? sort.join(',') : sort,
          where: where ? { and: [filter, where] } : filter,
        },
        { addQueryPrefix: true },
      );

      try {
        const response = await fetch(
          formatAdminURL({ apiRoute: config.routes.api, path: `/${collectionSlug}${query}` }),
          { credentials: 'include' },
        ).catch(() => undefined);

        if (!response?.ok) return;

        const result = (await response.json()) as { docs: Row[]; hasNextPage: boolean };

        setRows((current) => {
          if (pageToLoad === 1) return result.docs;

          const seen = new Set(current.map((row) => row.id));

          return [...current, ...result.docs.filter((row) => !seen.has(row.id))];
        });

        setHasMore(result.hasNextPage);
        setPage(pageToLoad);
      } finally {
        loadingRef.current = false;
      }
    },
    [collectionSlug, config.routes.api, field, id, limit, on, sort, where],
  );

  useEffect(() => {
    if (drafting) draftRef.current?.focus();
  }, [drafting]);

  useEffect(() => {
    void load(1).catch(() => toast.error('Could not load the related records'));
  }, [load]);

  const { saving, toggle } = useToggleDone<Row>({
    collectionSlug,
    onSaved: (doc) => {
      setRows((current) => current.map((row) => (row.id === doc.id ? doc : row)));
      notify({ doc, operation: 'update', type: 'saved' });
    },
    useAsDone,
  });

  if (!field || !on || id === undefined || id === null) return null;

  const collectionPermissions = permissions?.collections?.[collectionSlug];
  const canCreate = field.admin?.allowCreate !== false && Boolean(collectionPermissions?.create);
  const canUpdate = Boolean(collectionPermissions?.update);
  const value = onValue(field, collectionSlug, id);
  const createData =
    initialData(collectionConfig.fields, on.split('.'), value) ?? setPath(on, value);

  const add = async (title: string, next: boolean) => {
    const data = { ...createData, ...setPath(titleField!, title) };

    if (addingRef.current) return;

    addingRef.current = true;
    setAdding(true);

    try {
      const response = await fetch(
        formatAdminURL({ apiRoute: config.routes.api, path: `/${collectionSlug}?depth=0` }),
        {
          body: JSON.stringify(data),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      ).catch(() => undefined);

      const result = (await response?.json().catch(() => undefined)) as
        { doc?: Row; errors?: { message?: string }[] } | undefined;

      if (!response?.ok || !result?.doc) {
        setDraft(undefined);
        toast.error(result?.errors?.[0]?.message ?? `Could not add the ${singular.toLowerCase()}`);
        create(data, { from: 'panel' });

        return;
      }

      const doc = result.doc;

      setRows((current) => [...current, doc]);
      notify({ doc, operation: 'create', type: 'saved' });
      setDraft(next ? '' : undefined);
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };

  const onDraftKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDraft(undefined);
    } else if (event.key === 'Enter') {
      event.preventDefault();

      if (draft?.trim()) void add(draft.trim(), true);
      else setDraft(undefined);
    }
  };

  const heading = field.label ? getTranslation(field.label, i18n) : field.name;
  const singular = collectionConfig.labels?.singular
    ? getTranslation(collectionConfig.labels.singular, i18n)
    : collectionSlug;

  return (
    <PanelSection
      addLabel={`Add ${singular.toLowerCase()}`}
      className="fb-panel-join"
      heading={heading}
      onAdd={
        canCreate
          ? () => (titleField ? setDraft('') : create(createData, { from: 'panel' }))
          : undefined
      }
    >
      {rows.length || draft !== undefined ? (
        <ul className="fb-panel-join__rows">
          {rows.map((row) => {
            const done = isRecordDone(row, useAsDone);

            return (
              <li
                className={`fb-panel-join__row${done ? ' fb-panel-join__row--done' : ''}`}
                key={row.id}
              >
                {useAsDone ? (
                  <DoneCheck
                    disabled={!canUpdate || saving}
                    done={done}
                    onToggle={(next) => void toggle(row, next)}
                  />
                ) : null}
                <button
                  className="fb-panel-join__title"
                  onClick={({ ctrlKey, metaKey, shiftKey }) =>
                    open(row.id, { ctrlKey, from: 'panel', metaKey, shiftKey })
                  }
                  type="button"
                >
                  {rowTitle(row, titleField)}
                </button>
              </li>
            );
          })}
          {draft !== undefined ? (
            <li className="fb-panel-join__row fb-panel-join__row--draft">
              {useAsDone ? <DoneCheck disabled done={false} onToggle={() => undefined} /> : null}
              <input
                aria-label={`New ${singular.toLowerCase()} name`}
                className="fb-panel-join__input"
                onBlur={() => {
                  if (adding) return;
                  if (draft.trim()) void add(draft.trim(), false);
                  else setDraft(undefined);
                }}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onDraftKey}
                placeholder={`Write a ${singular.toLowerCase()} name`}
                readOnly={adding}
                ref={draftRef}
                value={draft}
              />
            </li>
          ) : null}
          {hasMore ? (
            <li className="fb-panel-join__row">
              <button
                className="fb-panel-join__more"
                onClick={() => void load(page + 1)}
                type="button"
              >
                Show more
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </PanelSection>
  );
}

/**
 * A join to the panel's own collection, such as subtasks, as a section: the field's label, a
 * row per related record that opens it in the panel with a back link, a done check when the
 * collection has `useAsDone`, and `+` to add one with the join's `on` field set to the open
 * record. With a `useAsTitle`, `+` adds an inline row: type the title, Enter saves it and starts
 * the next, Escape discards, and the panel stays on the open record. A save the server refuses
 * opens the create form with the title filled. Renders nothing on a create form, like Payload's
 * join before the first save.
 */
export const PanelJoinField = withCondition(PanelJoinFieldComponent);
