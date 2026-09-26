import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type { SearchReadiness } from 'frogbot/search';
import { SearchReadinessError } from 'frogbot/search';

import { createSearchSetupError } from './createSearchSetupError.js';
import { findSearchIndex } from './findSearchIndex.js';
import { getSearchIndexes } from './getSearchIndexes.js';
import { getSearchModel } from './getSearchModel.js';

export const readiness: SearchReadiness = async ({ collection, db, index, mode }) => {
  const adapter = db as MongooseAdapter;

  const searchIndexes = getSearchIndexes(adapter).filter(
    (searchIndex) =>
      searchIndex.collection === collection &&
      searchIndex.index === index.name &&
      (mode === 'hybrid' || searchIndex.mode === mode),
  );

  for (const searchIndex of searchIndexes) {
    const Model = getSearchModel({ adapter, collection, versions: searchIndex.versions });

    let existing: Awaited<ReturnType<typeof findSearchIndex>>;

    try {
      existing = await findSearchIndex({ Model, name: searchIndex.name });
    } catch (error) {
      const setupError = createSearchSetupError({ error, searchIndex });

      throw setupError.reason === 'setup-failed' ? error : setupError;
    }

    if (!existing) {
      throw new SearchReadinessError(
        `Search index '${searchIndex.name}' on '${Model.collection.name}' does not exist.`,
      );
    }

    if (!existing.queryable) {
      throw new SearchReadinessError(
        `Search index '${searchIndex.name}' on '${Model.collection.name}' is not queryable yet (${existing.status ?? 'unknown'}).`,
      );
    }
  }
};
