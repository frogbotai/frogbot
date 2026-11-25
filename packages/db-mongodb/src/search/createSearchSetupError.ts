import type { FrogBotError } from 'frogbot';
import { searchUnavailable } from 'frogbot/search';

import type { SearchIndex } from './types.js';

const missingPrerequisiteCodes = new Set([59, 115, 31082, 40324]);

const permissionDeniedCodes = new Set([13]);

const atlasErrorCode = 8000;

const permissionDeniedMessage = /not (allowed|authorized)|unauthorized/i;

export function getErrorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createSearchSetupError({
  error,
  searchIndex,
}: {
  error: unknown;
  searchIndex: SearchIndex;
}): FrogBotError {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);

  if (typeof code === 'number' && missingPrerequisiteCodes.has(code)) {
    return searchUnavailable({
      collection: searchIndex.collection,
      index: searchIndex.index,
      mode: searchIndex.mode,
      reason: 'missing-prerequisite',
      detail: `search-infrastructure: MongoDB search requires Atlas or a deployment running mongot. ${message}`,
    });
  }

  const permissionDenied =
    (typeof code === 'number' && permissionDeniedCodes.has(code)) ||
    (code === atlasErrorCode && permissionDeniedMessage.test(message));

  if (permissionDenied) {
    return searchUnavailable({
      collection: searchIndex.collection,
      index: searchIndex.index,
      mode: searchIndex.mode,
      reason: 'permission-denied',
      detail: `The database user cannot manage search index '${searchIndex.name}'. ${message}`,
    });
  }

  return searchUnavailable({
    collection: searchIndex.collection,
    index: searchIndex.index,
    mode: searchIndex.mode,
    reason: 'setup-failed',
    detail: `Search index '${searchIndex.name}' could not be reconciled. ${message}`,
  });
}
