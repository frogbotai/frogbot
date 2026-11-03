import { createRequire } from 'node:module';

import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { installPartialCompoundIndexes } from '../../../packages/db-mongodb/src/compoundIndexes.js';

const require = createRequire(
  new URL('../../../packages/db-mongodb/package.json', import.meta.url),
);

const { Schema } = createRequire(require.resolve('@payloadcms/db-mongodb'))(
  'mongoose',
) as typeof mongoose;

function indexField(path: string, required: boolean) {
  return {
    field: { name: path, type: 'number', required },
    localizedPath: path,
    path,
    pathHasLocalized: false,
  };
}

async function indexesAfterInit(fields: ReturnType<typeof indexField>[]) {
  const schema = new Schema({});
  const spec = Object.fromEntries(fields.map(({ path }) => [path, 1 as const]));

  schema.index(spec, { unique: true });

  const database = {
    init: async () => {},
    payload: {
      config: { collections: [{ slug: 'issues', sanitizedIndexes: [{ fields, unique: true }] }] },
    },
    collections: { issues: { schema } },
  } as unknown as MongooseAdapter;

  installPartialCompoundIndexes(database);
  await database.init!();

  return schema.indexes();
}

describe('unique compound indexes on MongoDB', () => {
  it('index only records that have every value when a field is optional', async () => {
    expect(
      await indexesAfterInit([indexField('project', true), indexField('number', false)]),
    ).toEqual([
      [
        { project: 1, number: 1 },
        {
          unique: true,
          partialFilterExpression: {
            project: { $type: expect.arrayContaining(['number', 'string', 'objectId']) },
            number: { $type: expect.not.arrayContaining(['null']) },
          },
        },
      ],
    ]);
  });

  it('stay as they are when every field is required', async () => {
    expect(await indexesAfterInit([indexField('owner', true), indexField('piece', true)])).toEqual([
      [{ owner: 1, piece: 1 }, { unique: true }],
    ]);
  });
});
