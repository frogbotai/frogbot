import type { SearchAdapter } from '../../../../database/types.js';
import { createSchemaBuilder } from '../createSchemaBuilder.js';
import { readiness } from '../readiness.js';
import { search } from '../search.js';
import { capabilities } from './capabilities.js';

export const sqliteD1SearchAdapter: SearchAdapter = {
  buildSchema: createSchemaBuilder(),
  capabilities,
  readiness,
  search,
};
