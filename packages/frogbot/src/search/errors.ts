import { APIError } from 'payload';

import type { SearchMode } from './types.js';

export class SearchValidationError extends APIError {
  name = 'SearchValidationError';

  constructor(message: string) {
    super(message, 400);
  }
}

export class SearchFilterUnsupportedError extends APIError {
  name = 'SearchFilterUnsupportedError';

  constructor(message: string) {
    super(message, 400);
  }
}

export class SearchReadinessError extends APIError {
  name = 'SearchReadinessError';

  constructor(message: string) {
    super(message, 503);
  }
}

export class SearchCapabilityError extends APIError {
  name = 'SearchCapabilityError';

  constructor(
    collection: string,
    index: string,
    mode: SearchMode,
    public readonly reason:
      | 'engine-gap'
      | 'not-implemented'
      | 'missing-prerequisite'
      | 'permission-denied'
      | 'setup-failed',
    detail: string,
  ) {
    super(
      `[frogbot] Search index '${index}' in collection '${collection}' (${mode}): ${reason}: ${detail}`,
      501,
    );
  }
}
