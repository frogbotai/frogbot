import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import { SearchCapabilityError } from 'frogbot/search';

import { createSearchSetupError } from './createSearchSetupError.js';
import type { SearchIndexInfo } from './findSearchIndex.js';
import { findSearchIndex } from './findSearchIndex.js';
import { getSearchIndexes } from './getSearchIndexes.js';
import type { SearchModel } from './getSearchModel.js';
import { getSearchModel } from './getSearchModel.js';
import { isSearchIndexDefinitionEqual } from './isSearchIndexDefinitionEqual.js';
import type { SearchIndex } from './types.js';

const droppedIndexTimeout = 60000;

const droppedIndexInterval = 500;

async function findCurrentSearchIndex({
  dropped,
  Model,
  name,
}: {
  dropped: boolean;
  Model: SearchModel;
  name: string;
}): Promise<SearchIndexInfo | undefined> {
  const started = Date.now();
  let existing = await findSearchIndex({ Model, name });

  while (dropped && existing) {
    if (Date.now() - started > droppedIndexTimeout) {
      throw new Error(`Search index '${name}' from the dropped database was not removed in time.`);
    }

    await new Promise((resolve) => setTimeout(resolve, droppedIndexInterval));

    existing = await findSearchIndex({ Model, name });
  }

  return existing;
}

async function ensureSearchIndex({
  adapter,
  dropped,
  searchIndex,
}: {
  adapter: MongooseAdapter;
  dropped: boolean;
  searchIndex: SearchIndex;
}): Promise<void> {
  const Model = getSearchModel({
    adapter,
    collection: searchIndex.collection,
    versions: searchIndex.versions,
  });

  await Model.createCollection();

  const existing = await findCurrentSearchIndex({ dropped, Model, name: searchIndex.name });

  if (!existing) {
    adapter.payload.logger.info(
      `Creating search index '${searchIndex.name}' on '${Model.collection.name}'.`,
    );

    await Model.createSearchIndex({
      name: searchIndex.name,
      type: searchIndex.type,
      definition: searchIndex.definition,
    });

    return;
  }

  if (existing.type !== searchIndex.type) {
    throw new SearchCapabilityError(
      searchIndex.collection,
      searchIndex.index,
      searchIndex.mode,
      'setup-failed',
      `Search index '${searchIndex.name}' already exists with type '${existing.type}'.`,
    );
  }

  const current = isSearchIndexDefinitionEqual({
    actual: existing.latestDefinition,
    expected: searchIndex.definition,
  });

  if (current && existing.status === 'FAILED') {
    throw new SearchCapabilityError(
      searchIndex.collection,
      searchIndex.index,
      searchIndex.mode,
      'setup-failed',
      `Search index '${searchIndex.name}' failed to build. Drop it after fixing the cause so it is recreated.`,
    );
  }

  if (current) return;

  adapter.payload.logger.info(
    `Updating search index '${searchIndex.name}' on '${Model.collection.name}'.`,
  );

  await Model.updateSearchIndex(searchIndex.name, searchIndex.definition);
}

export async function ensureSearchIndexes({
  adapter,
  dropped = false,
}: {
  adapter: MongooseAdapter;
  dropped?: boolean;
}): Promise<void> {
  for (const searchIndex of getSearchIndexes(adapter)) {
    try {
      await ensureSearchIndex({ adapter, dropped, searchIndex });
    } catch (error) {
      if (error instanceof SearchCapabilityError) throw error;

      throw createSearchSetupError({ error, searchIndex });
    }
  }
}
