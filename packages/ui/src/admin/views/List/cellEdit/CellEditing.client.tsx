'use client';

import { useAuth, useConfig, useRouter } from '@payloadcms/ui';
import type { ClientField } from 'payload';
import { type RefObject, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';

import { useRecordPanel } from '../../panel/RecordPanelProvider.client.js';
import { CellEditor, type CellEditorDone, type CellEditorHandle } from './CellEditor.client.js';
import { resolveFieldAtPath } from './fieldPath.js';

type ActiveCell = {
  cell: HTMLTableCellElement;
  column: string;
  initialText?: string;
  pendingDone?: Exclude<CellEditorDone, 'cancel'>;
  rowId: string;
};

const ROWS = '.table:not(.table--drag-preview) tbody > tr';

const EDITOR_LAYERS =
  '.fb-cell-editor, .rs__menu, .rs__menu-portal, .react-datepicker, .react-datepicker-popper, #date-time-picker-portal, .popup__content, [role="dialog"], [data-sonner-toaster], .payload__modal-item';

function rowId(row: HTMLElement): string | undefined {
  return row.dataset.id ?? row.querySelector<HTMLElement>('[data-row-id]')?.dataset.rowId;
}

function editableCells(container: HTMLElement): HTMLTableCellElement[] {
  return Array.from(
    container.querySelectorAll<HTMLTableCellElement>(`${ROWS} > td[data-cell-edit]`),
  );
}

function toActive(td: HTMLTableCellElement, initialText?: string): ActiveCell | undefined {
  const id = td.parentElement ? rowId(td.parentElement) : undefined;
  const column = td.dataset.cellEdit;

  return id && column ? { cell: td, column, initialText, rowId: id } : undefined;
}

function isPrintable(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  ArrowUp: [-1, 0],
};

function neighborCell(td: HTMLTableCellElement, event: KeyboardEvent) {
  const move = ARROWS[event.key];
  const row = td.parentElement;

  if (!move || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return undefined;
  if (td.closest('[role="grid"]') || !(row instanceof HTMLTableRowElement)) return undefined;

  const rows = Array.from(row.parentElement?.children ?? []);
  const target = rows[rows.indexOf(row) + move[0]];

  return target instanceof HTMLTableRowElement ? target.cells[td.cellIndex + move[1]] : undefined;
}

function focusCell(td: HTMLTableCellElement | undefined) {
  if (!td) return;
  if (!td.hasAttribute('tabindex')) td.setAttribute('tabindex', '-1');
  td.focus();
}

/**
 * Turns a list's editable columns into cells that edit in place. Rows stay Payload's
 * server-rendered cells; only the cell being edited mounts a `CellEditor`. Click, Enter, F2 or
 * typing on a focused cell starts an edit; Tab saves and moves on, wrapping to the next row.
 */
export function CellEditing({
  collectionSlug,
  columns,
  containerRef,
}: {
  collectionSlug: string;
  columns: string[];
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const { getEntityConfig } = useConfig();
  const { permissions } = useAuth();
  const router = useRouter();
  const panel = useRecordPanel();
  const [active, setActive] = useState<ActiveCell>();
  const [, startTransition] = useTransition();
  const handleRef = useRef<CellEditorHandle | null>(null);
  const activeRef = useRef(active);
  const panelRef = useRef(panel);
  const columnsKey = columns.join('\n');
  const fields = getEntityConfig({ collectionSlug })?.fields ?? [];

  useEffect(() => {
    activeRef.current = active;
    panelRef.current = panel;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const paths = columnsKey ? columnsKey.split('\n') : [];
    const byClass = new Map(
      paths.flatMap((path) => [
        [`cell-${path}`, path],
        [`cell-${path.replace(/\./g, '__')}`, path],
      ]),
    );

    const mark = () => {
      container.querySelectorAll<HTMLTableCellElement>(`${ROWS} > td`).forEach((td) => {
        const className = [...td.classList].find((name) => byClass.has(name));
        const path =
          className && !td.classList.contains('cell--linked') && td.parentElement
            ? rowId(td.parentElement) && byClass.get(className)
            : undefined;

        if (td.dataset.cellEdit === path) return;
        if (path) td.dataset.cellEdit = path;
        else delete td.dataset.cellEdit;
      });
    };

    mark();
    const observer = new MutationObserver(mark);

    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [columnsKey, containerRef]);

  const queueKey = useCallback((event: KeyboardEvent) => {
    const { key, shiftKey } = event;
    const done =
      key === 'Enter' ? 'saved' : key === 'Tab' ? (shiftKey ? 'prev' : 'next') : undefined;

    setActive((current) => {
      if (!current || key === 'Escape') return undefined;
      if (done) return { ...current, pendingDone: done };

      return isPrintable(event)
        ? { ...current, initialText: `${current.initialText ?? ''}${key}` }
        : current;
    });
  }, []);

  const commit = useCallback(async () => handleRef.current?.commit() ?? true, []);

  const start = useCallback(
    async (next: ActiveCell) => {
      const current = activeRef.current;

      if (current?.rowId === next.rowId && current.column === next.column) return;
      if (current && !(await commit())) return;
      activeRef.current = next;
      setActive(next);
      focusCell(next.cell);
    },
    [commit],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const td = target?.closest<HTMLTableCellElement>('td[data-cell-edit]');

      if (!td || !container.contains(td) || event.button !== 0) return;
      if (target?.closest('.fb-cell-editor, a, button, input, label, [role="checkbox"]')) return;

      const next = toActive(td);

      if (next) void start(next);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const td = event.target;

      if (event.defaultPrevented || !(td instanceof HTMLTableCellElement)) return;
      if (!container.contains(td)) return;

      if (activeRef.current?.cell === td) {
        event.preventDefault();
        queueKey(event);

        return;
      }

      const neighbor = neighborCell(td, event);

      if (neighbor) {
        event.preventDefault();
        focusCell(neighbor);

        return;
      }

      const starts = event.key === 'Enter' || event.key === 'F2' || isPrintable(event);
      const next = starts ? toActive(td, isPrintable(event) ? event.key : undefined) : undefined;

      if (!next) return;
      event.preventDefault();
      void start(next);
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;

      if (!activeRef.current || !target || target.closest(EDITOR_LAYERS)) return;
      if (target.closest('td[data-cell-edit]') && container.contains(target)) return;

      void commit().then((saved) => {
        if (saved) setActive(undefined);
      });
    };

    container.addEventListener('click', onClick);
    container.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      container.removeEventListener('click', onClick);
      container.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [commit, containerRef, queueKey, start]);

  const onSaved = useCallback(() => {
    const id = activeRef.current?.rowId;

    if (id) panelRef.current.reload(id);
    startTransition(() => router.refresh());
  }, [router]);

  const onDone = useCallback(
    (done: CellEditorDone) => {
      const container = containerRef.current;
      const current = activeRef.current;
      if (!container || !current) return;

      const cells = editableCells(container);
      const td = current.cell;
      const index = cells.indexOf(td);
      const step = done === 'next' ? 1 : done === 'prev' ? -1 : 0;
      const next = step && index !== -1 ? cells[index + step] : undefined;
      const following = next ? toActive(next) : undefined;

      setActive(following);
      if (!following) window.requestAnimationFrame(() => focusCell(td));
    },
    [containerRef],
  );

  const found = active ? resolveFieldAtPath<ClientField>(fields, active.column) : undefined;

  if (!active || !found) return null;

  const parentPath = found.parents.map(({ name }) => name).join('.');

  return createPortal(
    <CellEditor
      collectionSlug={collectionSlug}
      field={found.field}
      handleRef={handleRef}
      id={active.rowId}
      initialText={active.initialText}
      pendingDone={active.pendingDone}
      key={`${active.rowId}:${active.column}`}
      onDone={onDone}
      onSaved={onSaved}
      parentPath={parentPath}
      path={active.column}
      permissions={permissions?.collections?.[collectionSlug]}
    />,
    active.cell,
  );
}
