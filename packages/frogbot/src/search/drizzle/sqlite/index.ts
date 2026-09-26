import type { SearchAdapter } from '../../../database/types.js';
import { capabilities } from './capabilities.js';
import { createSchemaBuilder } from './createSchemaBuilder.js';
import { assertSearchPrerequisites } from './prerequisites.js';
import { readiness } from './readiness.js';
import { search } from './search.js';

export const sqliteSearchAdapter: SearchAdapter = {
  buildSchema: createSchemaBuilder({ assertPrerequisites: assertSearchPrerequisites }),
  capabilities,
  readiness,
  search,
};
