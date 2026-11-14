import type { ClientCollectionConfig } from 'payload';

import { getPath } from '../cells.js';

/** The checkbox field a collection marks done records with, from `admin.useAsDone`. */
export function getUseAsDone(collectionConfig: ClientCollectionConfig): string | undefined {
  const frogbot = collectionConfig.admin?.custom?.frogbot as { useAsDone?: unknown } | undefined;

  return typeof frogbot?.useAsDone === 'string' ? frogbot.useAsDone : undefined;
}

export function isRecordDone(row: Record<string, unknown>, useAsDone: string | undefined): boolean {
  return useAsDone ? getPath(row, useAsDone) === true : false;
}

/** The shared classes every view puts on a record: done, and selected while it's open in the panel. */
export function recordClassName({ done, selected }: { done: boolean; selected: boolean }): string {
  return ['fb-record', done && 'fb-record--done', selected && 'fb-record--selected']
    .filter(Boolean)
    .join(' ');
}
