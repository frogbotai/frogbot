'use client';

import { commandPaletteSlug, useConfig, useModal, useTranslation } from '@payloadcms/ui';
import { formatAdminURL } from 'payload/shared';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { cookieFetch } from '../../../chat/rest/auth.js';
import {
  CommandMenu,
  type CommandMenuGroup,
  type CommandMenuItem,
} from '../../../components/command-menu.js';
import { Dialog, DialogContent, DialogTitle } from '../../../components/dialog.js';
import { Shortcut } from '../../../components/shortcut.js';
import { useNavAdapter } from '../../../nav/adapter.js';
import type { PaletteModel } from './buildPaletteModel.js';
import { filterRows } from './fuzzyMatch.js';
import { type RecordResult, searchCollection } from './searchRecords.js';

export type RecordPaletteProps = PaletteModel;

type RecordState = 'failed' | 'loading' | RecordResult[];

type RecordSearch = { id: number; results: Record<string, RecordState> };

type Target = { createPath?: string; path: string };

const SEARCH_DELAY_MS = 200;
const NO_SEARCH: RecordSearch = { id: 0, results: {} };

function highlight(label: string, indices: number[] | undefined): ReactNode {
  if (!indices?.length) return label;

  const matches = new Set(indices);
  const parts: ReactNode[] = [];
  let start = 0;

  for (let index = 1; index <= label.length; index++) {
    if (index < label.length && matches.has(index) === matches.has(start)) continue;

    const text = label.slice(start, index);

    parts.push(
      matches.has(start) ? (
        <strong className="fb-record-palette__match" key={start}>
          {text}
        </strong>
      ) : (
        text
      ),
    );

    start = index;
  }

  return parts;
}

/**
 * Cmd+K: FrogBot's palette in place of Payload's. Lists the sidebar's entries and, as you type,
 * each searchable collection's matching records through REST, so the user's read access applies.
 */
export function RecordPalette({ collections, rows }: RecordPaletteProps) {
  const { closeModal, modalState } = useModal();
  const { config } = useConfig();
  const { t } = useTranslation();
  const { navigate } = useNavAdapter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [search, setSearch] = useState(NO_SEARCH);
  const searchId = useRef(0);
  const payloadOpen = Boolean(modalState[commandPaletteSlug]?.isOpen);
  const text = value.trim();
  const apiRoute = config.routes.api;
  const adminRoute = config.routes.admin;

  useEffect(() => {
    if (!payloadOpen) return;

    closeModal(commandPaletteSlug);
    setOpen((current) => !current);
  }, [closeModal, payloadOpen]);

  useEffect(() => {
    if (!text) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      const id = ++searchId.current;
      const settle = (slug: string, state: RecordState) =>
        setSearch((current) =>
          current.id === id ? { id, results: { ...current.results, [slug]: state } } : current,
        );

      setSearch({
        id,
        results: Object.fromEntries(collections.map(({ slug }) => [slug, 'loading'])),
      });

      for (const collection of collections) {
        searchCollection({
          apiRoute,
          collection,
          fetch: cookieFetch(),
          signal: controller.signal,
          text,
        }).then(
          (records) => settle(collection.slug, records),
          () => {
            if (!controller.signal.aborted) settle(collection.slug, 'failed');
          },
        );
      }
    }, SEARCH_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiRoute, collections, text]);

  const targets = new Map<string, Target>();

  const rowGroups: CommandMenuGroup[] = filterRows(rows, value).map(({ group, rows: matched }) => ({
    id: `rows:${group ?? ''}`,
    items: matched.map((row) => {
      const id = `row:${row.path}`;

      targets.set(id, { createPath: row.createPath, path: row.path });

      return { id, label: highlight(row.label, row.matchIndices) };
    }),
    label: group ?? undefined,
  }));

  const recordGroups: CommandMenuGroup[] = text
    ? collections.flatMap(({ label, slug }) => {
        const state = search.results[slug];

        if (!state || state === 'failed') return [];

        const records = state === 'loading' ? [] : state;

        return [
          {
            id: `records:${slug}`,
            items: records.map((record) => {
              const id = `record:${slug}:${String(record.id)}`;
              const path = formatAdminURL({
                adminRoute,
                path: `/collections/${slug}/${encodeURIComponent(String(record.id))}`,
              });

              targets.set(id, { path });

              return { id, label: record.title };
            }),
            label,
            loading: state === 'loading',
          },
        ];
      })
    : [];

  function close() {
    setOpen(false);
    setValue('');
    setSearch(NO_SEARCH);
  }

  function select(item: CommandMenuItem, { meta }: { meta: boolean }) {
    const target = targets.get(item.id);
    const path = meta ? target?.createPath : target?.path;

    if (!path) return;

    close();
    navigate(path);
  }

  const title = t('commandPalette:title');

  return (
    <>
      <span className="fb-record-palette-marker" hidden />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="fb-record-palette"
          withCloseButton={false}
        >
          <DialogTitle className="fb-record-palette__title">{title}</DialogTitle>
          <CommandMenu
            emptyText={t('commandPalette:noResults')}
            footer={(active) => (
              <>
                {active && (
                  <span className="fb-record-palette__hint">
                    {t('commandPalette:hintSelect')}
                    <Shortcut shortcutKey="↵" />
                  </span>
                )}
                {active && targets.get(active.id)?.createPath && (
                  <span className="fb-record-palette__hint">
                    {t('commandPalette:hintCreate')}
                    <Shortcut shortcutKey="↵" withCtrl />
                  </span>
                )}
                <span className="fb-record-palette__hint">
                  {t('commandPalette:hintClose')}
                  <Shortcut shortcutKey="esc" />
                </span>
              </>
            )}
            groups={[...rowGroups, ...recordGroups]}
            label={title}
            placeholder={t('commandPalette:placeholder')}
            value={value}
            onSelect={select}
            onValueChange={setValue}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
