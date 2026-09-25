import type { SearchAdapter } from '../../../database/types.js';
import { buildSchema } from './buildSchema.js';
import { search } from './search.js';

export const postgresSearchAdapter: SearchAdapter = {
  buildSchema,
  capabilities: () => ({ lexical: 'supported', vector: 'supported', hybrid: 'supported' }),
  search,
};
