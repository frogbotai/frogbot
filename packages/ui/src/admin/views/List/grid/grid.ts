/** A list's row height step, saved per user per view. */
export const ROW_HEIGHTS = ['compact', 'default', 'tall'] as const;

export type RowHeight = (typeof ROW_HEIGHTS)[number];

/** Resized column widths in pixels, keyed by column accessor. */
export type ColumnWidths = Record<string, number>;

/** The list grid's per-user setup, stored in the view preference beside sort and filters. */
export type GridSettings = { rowHeight: RowHeight; widths: ColumnWidths };

/** A resized column's bounds and the keyboard step, in pixels. */
export const COLUMN_WIDTH = { max: 800, min: 60, step: 16 } as const;

/** The widest a grouped list sizes a column to its content; longer text wraps. */
export const GROUP_COLUMN_MAX = 320;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function clampWidth(width: number): number {
  return Math.round(Math.min(COLUMN_WIDTH.max, Math.max(COLUMN_WIDTH.min, width)));
}

function isRowHeight(value: unknown): value is RowHeight {
  return ROW_HEIGHTS.some((height) => height === value);
}

/**
 * Reads the grid setup from a stored view preference. Widths that aren't finite numbers are
 * dropped, the rest are clamped, and an unknown row height reads as `default`.
 */
export function readGridSettings(preference: unknown): GridSettings {
  const value = isRecord(preference) ? preference : {};
  const widths = isRecord(value.widths) ? value.widths : {};

  return {
    rowHeight: isRowHeight(value.rowHeight) ? value.rowHeight : 'default',
    widths: Object.fromEntries(
      Object.entries(widths).flatMap(([accessor, width]) =>
        typeof width === 'number' && Number.isFinite(width) ? [[accessor, clampWidth(width)]] : [],
      ),
    ),
  };
}

function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&').replace(/[\n\r<>]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;
}

/** The selection and drag-handle columns, which are never resized and never the title. */
export const CONTROL_COLUMNS = ['_select', '_dragHandle'];

/**
 * A header cell's column accessor. Payload's orderable table has no `data-column`, so it falls
 * back to the `heading-<accessor>` id, where dots may be written as `__`.
 */
export function headerAccessor(cell: HTMLTableCellElement): string {
  return cell.dataset.column ?? cell.id.replace(/^heading-/, '').replace(/__/g, '.');
}

function columnSelector(accessor: string): string {
  const names = [...new Set([accessor, accessor.replace(/\./g, '__')])];

  return [
    `[data-column=${cssString(accessor)}]`,
    ...names.flatMap((name) => [
      `[id=${cssString(`heading-${name}`)}]`,
      `[class~=${cssString(`cell-${name}`)}]`,
    ]),
  ].join(',');
}

/**
 * The stylesheet that sizes every resized column: header, body and summary cells of each table
 * in the list share one rule, in `@layer frogbot` so app CSS wins. Cells are matched by Payload's
 * `data-column`, `heading-` id and `cell-` class, so the plain and the orderable table both work.
 */
export function columnWidthsCss(widths: ColumnWidths): string {
  const rules = Object.entries(widths).map(
    ([accessor, width]) =>
      `.fb-list-grid :is(${columnSelector(accessor)}){width:${width}px;min-width:${width}px;max-width:${width}px}`,
  );

  return rules.length ? `@layer frogbot{${rules.join('')}}` : '';
}
