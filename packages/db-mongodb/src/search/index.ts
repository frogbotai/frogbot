import type { SearchAdapter } from 'frogbot/search';

import { buildSchema } from './buildSchema.js';
import { capabilities } from './capabilities.js';
import { readiness } from './readiness.js';
import { search } from './search.js';

export { ensureSearchIndexes } from './ensureSearchIndexes.js';

export const mongooseSearchAdapter: SearchAdapter = {
  buildSchema,
  capabilities,
  readiness,
  search,
};
