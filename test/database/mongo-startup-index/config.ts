import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterRequire = createRequire(
  path.resolve(dirname, '../../../packages/db-mongodb/package.json'),
);
const payloadAdapterRequire = createRequire(adapterRequire.resolve('@payloadcms/db-mongodb'));
const mongoose = payloadAdapterRequire('mongoose');

const connection = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
await connection.collection('dupes').insertMany([{ code: 'same' }, { code: 'same' }]);
await connection.close();

const Dupes: CollectionConfig = {
  slug: 'dupes',
  access: openAccess,
  fields: [{ name: 'code', type: 'text', unique: true }],
};

export default await buildTestConfig({ collections: [Dupes] });
