const RECORDS = '.table tbody > tr, [data-record-id]';

/** The record id of a list row, from its `data-id` or the hidden id cell. */
export function rowRecordId(row: HTMLElement): string | undefined {
  return row.dataset.id ?? row.querySelector<HTMLElement>('[data-row-id]')?.dataset.rowId;
}

/**
 * The ids of the records a view shows, once each, in the order it shows them: list rows top to
 * bottom, board columns left to right and their cards top to bottom. Records inside `skip`, the
 * panel itself, don't count.
 */
export function viewRecordIds(view: Element, skip?: Element | null): string[] {
  const ids = new Set<string>();

  for (const element of view.querySelectorAll<HTMLElement>(RECORDS)) {
    if (skip?.contains(element)) continue;
    const id = element.dataset.recordId ?? rowRecordId(element);
    if (id) ids.add(id);
  }

  return [...ids];
}

/** The record after (`1`) or before (`-1`) `current`; none at either end or when it isn't shown. */
export function adjacentRecord(ids: string[], current: string, step: 1 | -1): string | undefined {
  const index = ids.indexOf(current);

  return index === -1 ? undefined : ids[index + step];
}
