import type { SearchAdapter } from '../../../database/types.js';
import { buildSchema } from './buildSchema.js';
import { capabilities } from './capabilities.js';
import { readiness } from './readiness.js';
import { search } from './search.js';

export const sqliteSearchAdapter: SearchAdapter = {
  buildSchema,
  capabilities,
  readiness,
  search,
};
