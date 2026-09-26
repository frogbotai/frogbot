import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type { BuildSearchSchema } from 'frogbot/search';

import { buildSearchIndexes } from './buildSearchIndexes.js';
import { ensureSearchIndexes } from './ensureSearchIndexes.js';
import { setSearchIndexes } from './getSearchIndexes.js';

export const buildSchema: BuildSearchSchema = ({ collections, db }) => {
  const adapter = db as MongooseAdapter;

  const indexes = collections.flatMap(({ slug, search }) =>
    Object.values(search).flatMap((index) =>
      buildSearchIndexes({ adapter, collection: slug, index }),
    ),
  );

  setSearchIndexes({ adapter, indexes });

  const { connect } = adapter;

  adapter.connect = async (options) => {
    await connect?.call(adapter, options);

    if (options?.hotReload || adapter.url === false) return;

    try {
      await ensureSearchIndexes({
        adapter,
        dropped: process.env.PAYLOAD_DROP_DATABASE === 'true',
      });
    } catch (error) {
      await adapter.destroy?.();

      throw error;
    }
  };
};
