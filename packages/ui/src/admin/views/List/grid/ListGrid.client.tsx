'use client';

import './ListGrid.css';

import { useServerFunctions } from '@payloadcms/ui';
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { patchPreference } from '../../preferences.js';
import {
  clampWidth,
  COLUMN_WIDTH,
  type ColumnWidths,
  columnWidthsCss,
  CONTROL_COLUMNS,
  type GridSettings,
  GROUP_COLUMN_MAX,
  headerAccessor,
  type RowHeight,
} from './grid.js';

const baseClass = 'fb-list-grid';

/** The grid setup the server read for the list, and the view preference it is saved in. */
export type ListGridSettings = GridSettings & { preferenceKey: string };

type ListGridContext = {
  getWidth: (accessor: string) => number | undefined;
  resize: (accessor: string, width: number) => void;
  rowHeight: RowHeight;
  save: () => void;
  setRowHeight: (rowHeight: RowHeight) => void;
  widths: ColumnWidths;
};

const Context = createContext<ListGridContext | null>(null);

export function useListGrid(): ListGridContext {
  const context = use(Context);

  if (!context) throw new Error('useListGrid must be used inside ListGridProvider');

  return context;
}

/**
 * Holds the list's column widths and row height. Widths change live while a column is resized
 * and are saved when the drag or key press ends; both are saved per user in the view preference.
 */
export function ListGridProvider({
  children,
  settings,
}: {
  children: ReactNode;
  settings: ListGridSettings;
}) {
  const { serverFunction } = useServerFunctions();
  const { preferenceKey } = settings;
  const savedKey = JSON.stringify([settings.widths, settings.rowHeight]);
  const [widths, setWidths] = useState(settings.widths);
  const [rowHeight, setRowHeightState] = useState(settings.rowHeight);
  const latest = useRef(widths);

  useEffect(() => {
    const [saved, height] = JSON.parse(savedKey) as [ColumnWidths, RowHeight];

    latest.current = saved;
    setWidths(saved);
    setRowHeightState(height);
  }, [savedKey]);

  const patch = (value: Record<string, unknown>) =>
    void patchPreference({ key: preferenceKey, patch: value, serverFunction });

  const context: ListGridContext = {
    getWidth: (accessor) => latest.current[accessor],
    resize: (accessor, width) => {
      const next = { ...latest.current, [accessor]: clampWidth(width) };

      latest.current = next;
      setWidths(next);
    },
    rowHeight,
    save: () => patch({ widths: latest.current }),
    setRowHeight: (next) => {
      setRowHeightState(next);
      patch({ rowHeight: next === 'default' ? undefined : next });
    },
    widths,
  };

  return <Context value={context}>{children}</Context>;
}

const headerSelector = '.table:not(.table--drag-preview) thead th';

function useHeaderCells(ref: RefObject<HTMLElement | null>): HTMLTableCellElement[] {
  const [cells, setCells] = useState<HTMLTableCellElement[]>([]);

  useEffect(() => {
    const container = ref.current;

    if (!container) return;

    const update = () =>
      setCells((current) => {
        const next = Array.from(
          container.querySelectorAll<HTMLTableCellElement>(headerSelector),
        ).filter((cell) => !CONTROL_COLUMNS.includes(headerAccessor(cell)));

        return next.length === current.length && next.every((cell, i) => cell === current[i])
          ? current
          : next;
      });

    const markScrolled = (event: Event) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains('table')) {
        event.target.toggleAttribute('data-scrolled', event.target.scrollLeft !== 0);
      }
    };

    update();

    const observer = new MutationObserver(update);

    observer.observe(container, { childList: true, subtree: true });
    container.addEventListener('scroll', markScrolled, true);

    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', markScrolled, true);
    };
  }, [ref]);

  return cells;
}

function tabToHandle(event: KeyboardEvent<HTMLDivElement>) {
  const target = event.target;

  if (event.key !== 'Tab' || event.shiftKey || !(target instanceof HTMLElement)) return;
  if (target.matches(`.${baseClass}__resize`)) return;

  const handle = target
    .closest('thead th')
    ?.querySelector<HTMLElement>(`:scope > .${baseClass}__resize`);

  if (!handle) return;

  event.preventDefault();
  handle.focus();
}

const groupTableSelector = '.table-wrap--group-by .table:not(.table--drag-preview) table';

function measureGroupWidths(
  container: HTMLElement,
  style: HTMLStyleElement | null,
  resized: ColumnWidths,
): ColumnWidths {
  const tables = Array.from(container.querySelectorAll<HTMLTableElement>(groupTableSelector));

  if (tables.length < 2) return {};

  const widths: ColumnWidths = {};

  const saved = tables.map((table) => table.getAttribute('style'));

  if (style) style.media = 'not all';

  tables.forEach((table) => {
    table.style.setProperty('table-layout', 'auto', 'important');
    table.style.setProperty('width', 'max-content', 'important');
    table.style.setProperty('min-width', '0', 'important');
  });

  for (const table of tables) {
    for (const cell of Array.from(table.tHead?.rows[0]?.cells ?? [])) {
      const accessor = headerAccessor(cell);

      if (!accessor || CONTROL_COLUMNS.includes(accessor) || resized[accessor]) continue;

      widths[accessor] = Math.min(
        GROUP_COLUMN_MAX,
        Math.max(widths[accessor] ?? 0, Math.ceil(cell.offsetWidth)),
      );
    }
  }

  tables.forEach((table, index) => {
    const value = saved[index];

    if (value === null || value === undefined) table.removeAttribute('style');
    else table.setAttribute('style', value);
  });

  if (style) style.media = '';

  return widths;
}

function sameWidths(a: ColumnWidths, b: ColumnWidths): boolean {
  const keys = Object.keys(a);

  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function useGroupWidths(
  ref: RefObject<HTMLElement | null>,
  style: RefObject<HTMLStyleElement | null>,
  resized: ColumnWidths,
): ColumnWidths {
  const [widths, setWidths] = useState<ColumnWidths>({});
  const resizedRef = useRef(resized);

  useLayoutEffect(() => {
    resizedRef.current = resized;
  });

  useLayoutEffect(() => {
    const container = ref.current;

    if (!container) return;

    const update = () => {
      const next = measureGroupWidths(container, style.current, resizedRef.current);

      setWidths((current) => (sameWidths(current, next) ? current : next));
    };

    const onMutation = (records: MutationRecord[]) => {
      if (records.some((record) => !(record.target instanceof HTMLStyleElement))) update();
    };

    const onLoad = () => update();

    const observer = new MutationObserver(onMutation);

    observer.observe(container, { characterData: true, childList: true, subtree: true });
    void document.fonts?.ready.then(update);
    window.addEventListener('load', onLoad);

    return () => {
      observer.disconnect();
      window.removeEventListener('load', onLoad);
    };
  }, [ref, style]);

  useLayoutEffect(() => {
    const container = ref.current;

    if (!container) return;

    const next = measureGroupWidths(container, style.current, resized);

    setWidths((current) => (sameWidths(current, next) ? current : next));
  }, [ref, resized, style]);

  return widths;
}

/**
 * Payload's list table with FrogBot's grid on top: resized column widths, the frozen title
 * column, the row height, and a resize handle in each header cell. Group tables and the summary
 * row inside it take the same widths, whether resized or not.
 */
export function ListGrid({ children }: { children: ReactNode }) {
  const { rowHeight, widths } = useListGrid();
  const ref = useRef<HTMLDivElement>(null);
  const groupStyle = useRef<HTMLStyleElement>(null);
  const cells = useHeaderCells(ref);
  const groupWidths = useGroupWidths(ref, groupStyle, widths);
  const grouped = Object.keys(groupWidths).length > 0;
  const css = columnWidthsCss(widths);

  return (
    <div
      className={baseClass}
      data-group-widths={grouped ? '' : undefined}
      data-row-height={rowHeight}
      onKeyDownCapture={tabToHandle}
      ref={ref}
    >
      {grouped ? <style ref={groupStyle}>{columnWidthsCss(groupWidths)}</style> : null}
      {css ? <style>{css}</style> : null}
      {children}
      {cells.map((cell) =>
        createPortal(
          <ResizeHandle accessor={headerAccessor(cell)} cell={cell} />,
          cell,
          `${cell.closest('table')?.id ?? ''}:${headerAccessor(cell)}`,
        ),
      )}
    </div>
  );
}

function ResizeHandle({ accessor, cell }: { accessor: string; cell: HTMLTableCellElement }) {
  const { getWidth, resize, save, widths } = useListGrid();
  const drag = useRef<{ width: number; x: number } | null>(null);
  const [active, setActive] = useState(false);
  const label = cell.querySelector('.sort-column__label')?.textContent?.trim() || accessor;
  const width = () => getWidth(accessor) ?? cell.getBoundingClientRect().width;
  const direction = () => (getComputedStyle(cell).direction === 'rtl' ? -1 : 1);

  const end = () => {
    if (!drag.current) return;

    drag.current = null;
    setActive(false);
    save();
  };

  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- a focusable separator is ARIA's window splitter widget */
  return (
    <div
      aria-label={`Resize ${label}`}
      aria-orientation="vertical"
      aria-valuemax={COLUMN_WIDTH.max}
      aria-valuemin={COLUMN_WIDTH.min}
      aria-valuenow={Math.round(widths[accessor] ?? cell.getBoundingClientRect().width)}
      className={`${baseClass}__resize`}
      data-active={active ? '' : undefined}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

        event.preventDefault();
        event.stopPropagation();

        resize(
          accessor,
          width() + (event.key === 'ArrowRight' ? 1 : -1) * direction() * COLUMN_WIDTH.step,
        );
      }}
      onKeyUp={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') save();
      }}
      onPointerCancel={end}
      onPointerDown={(event) => {
        if (event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { width: cell.getBoundingClientRect().width, x: event.clientX };
        setActive(true);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;

        resize(accessor, drag.current.width + (event.clientX - drag.current.x) * direction());
      }}
      onPointerUp={end}
      role="separator"
      tabIndex={0}
    />
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}
