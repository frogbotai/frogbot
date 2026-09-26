import { SearchCapabilityError } from 'frogbot/search';

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
}): SearchCapabilityError {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);

  if (typeof code === 'number' && missingPrerequisiteCodes.has(code)) {
    return new SearchCapabilityError(
      searchIndex.collection,
      searchIndex.index,
      searchIndex.mode,
      'missing-prerequisite',
      `search-infrastructure: MongoDB search requires Atlas or a deployment running mongot. ${message}`,
    );
  }

  const permissionDenied =
    (typeof code === 'number' && permissionDeniedCodes.has(code)) ||
    (code === atlasErrorCode && permissionDeniedMessage.test(message));

  if (permissionDenied) {
    return new SearchCapabilityError(
      searchIndex.collection,
      searchIndex.index,
      searchIndex.mode,
      'permission-denied',
      `The database user cannot manage search index '${searchIndex.name}'. ${message}`,
    );
  }

  return new SearchCapabilityError(
    searchIndex.collection,
    searchIndex.index,
    searchIndex.mode,
    'setup-failed',
    `Search index '${searchIndex.name}' could not be reconciled. ${message}`,
  );
}
