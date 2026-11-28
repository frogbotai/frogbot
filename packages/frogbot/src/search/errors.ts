import { frogbotError } from '../errors/catalog.js';
import type { FrogBotError } from '../errors/FrogBotError.js';
import { isFrogBotError } from '../errors/FrogBotError.js';
import type { SearchMode } from './types.js';

/** Why a search index can't run on the current database. */
export type SearchCapabilityReason =
  'engine-gap' | 'not-implemented' | 'missing-prerequisite' | 'permission-denied' | 'setup-failed';

export function describeSearchIndex(collection: string, index: string): string {
  return `Search index '${index}' in collection '${collection}'`;
}

/** A search query the caller can fix: `search.invalid`, 400. */
export function searchInvalid(detail: string): FrogBotError {
  return frogbotError('search.invalid', detail);
}

/** A filter the search engine can't run: `search.filter-unsupported`, 400. */
export function searchFilterUnsupported(detail: string): FrogBotError {
  return frogbotError('search.filter-unsupported', detail);
}

/** A search index that is still building: `search.not-ready`, 503. */
export function searchNotReady(detail: string): FrogBotError {
  return frogbotError('search.not-ready', detail);
}

/** A search index the database can't serve: `search.<reason>`, 501. */
export function searchUnavailable({
  collection,
  index,
  mode,
  reason,
  detail,
}: {
  collection: string;
  index: string;
  mode: SearchMode;
  reason: SearchCapabilityReason;
  detail: string;
}): FrogBotError {
  return frogbotError(`search.${reason}`, {
    detail: `${describeSearchIndex(collection, index)} (${mode}): ${detail}`,
    data: { collection, index, mode },
  });
}

/** True for a `search.<reason>` capability error from {@link searchUnavailable}. */
export function isSearchUnavailable(error: unknown): error is FrogBotError {
  return isFrogBotError(error) && error.status === 501 && error.code.startsWith('search.');
}
