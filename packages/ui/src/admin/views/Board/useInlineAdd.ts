'use client';

import { useRef, useState } from 'react';

import type { BoardRow } from './BoardDocumentCard.js';

/** A card being typed or saved in a column before the server returns it. */
export type BoardDraft = {
  columnKey: string;
  error?: string;
  id: string;
  saving: boolean;
  title: string;
};

/**
 * Inline cards for every column, saved through one queue per board so rapid adds keep the order
 * they were typed in: the collection's create hook reads the last order key, and parallel creates
 * would share it.
 */
export function useInlineAdd({
  create,
  onCreated,
  onTotal,
}: {
  create: (draft: BoardDraft) => Promise<BoardRow>;
  onCreated: (doc: BoardRow) => void;
  onTotal: (columnKey: string, delta: number) => void;
}) {
  const [drafts, setDrafts] = useState<BoardDraft[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextId = useRef(0);
  const current = useRef(drafts);

  const update = (next: (value: BoardDraft[]) => BoardDraft[]) => {
    current.current = next(current.current);
    setDrafts(current.current);
  };

  const patch = (id: string, value: Partial<BoardDraft>) =>
    update((list) => list.map((draft) => (draft.id === id ? { ...draft, ...value } : draft)));

  const open = (columnKey: string) => {
    const editing = current.current.find(
      (draft) => draft.columnKey === columnKey && !draft.saving && !draft.error && !draft.title,
    );

    if (editing) return;

    nextId.current += 1;

    update((list) => [
      ...list,
      { columnKey, id: `draft-${nextId.current}`, saving: false, title: '' },
    ]);
  };

  const remove = (id: string) => update((list) => list.filter((draft) => draft.id !== id));

  const submit = (id: string, next: boolean) => {
    const draft = current.current.find((candidate) => candidate.id === id);
    if (!draft || draft.saving || !draft.title.trim()) return;

    const saving = { ...draft, error: undefined, saving: true, title: draft.title.trim() };

    patch(id, saving);
    onTotal(draft.columnKey, 1);
    if (next) open(draft.columnKey);

    queue.current = queue.current.then(async () => {
      try {
        const doc = await create(saving);

        remove(id);
        onCreated(doc);
      } catch (error) {
        onTotal(draft.columnKey, -1);

        patch(id, {
          error: error instanceof Error ? error.message : 'Could not save the card',
          saving: false,
        });
      }
    });
  };

  return {
    change: (id: string, title: string) => patch(id, { title }),
    drafts,
    open,
    remove,
    submit,
  };
}
