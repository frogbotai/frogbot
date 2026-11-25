import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isMongooseAdapter, type MongooseAdapter } from '@frogbotai/db-mongodb';
import { buildConfig } from 'frogbot';
import { FrogBot, getFrogBotPayload } from 'frogbot/test';
import type { Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const builtAdapter = pathToFileURL(
  fileURLToPath(new URL('../../packages/db-mongodb/dist/index.js', import.meta.url)),
).href;

const documented = `import { type MigrateDownArgs, type MigrateUpArgs, migrationDatabase } from '${builtAdapter}'

export async function up({ req }: MigrateUpArgs): Promise<void> {
  const { db, session } = await migrationDatabase(req)

  await db.collection('posts').updateMany({}, { $set: { summary: 'up' } }, { session })
}

export async function down({ req }: MigrateDownArgs): Promise<void> {
  const { db, session } = await migrationDatabase(req)

  await db.collection('posts').updateMany({}, { $set: { summary: 'down' } }, { session })
}
`;

describe.skipIf(process.env.FROGBOT_DATABASE !== 'mongodb')('MongoDB migrations', () => {
  let frogbot: FrogBot;
  let payload: Payload;
  let adapter: MongooseAdapter;
  let migrationDir: string;

  const summaries = async () =>
    (await adapter.connection.collection('posts').find().toArray()).map(({ summary }) => summary);

  beforeAll(async () => {
    const { databaseAdapter } = await import('../databaseAdapter.js');

    frogbot = await new FrogBot().init({
      config: await buildConfig({
        secret: 'mongo-migration-secret',
        db: databaseAdapter,
        collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
        typescript: { autoGenerate: false },
      }),
      disableOnInit: true,
    });

    payload = getFrogBotPayload(frogbot);
    if (!isMongooseAdapter(payload.db)) throw new Error('expected the MongoDB adapter');

    adapter = payload.db;
    migrationDir = await mkdtemp(join(tmpdir(), 'frogbot-migrations-mongo-'));
    adapter.migrationDir = migrationDir;

    await writeFile(join(migrationDir, '20260101_000000_summary.ts'), documented);
  });

  afterAll(async () => {
    await adapter?.connection.dropDatabase();
    await frogbot?.destroy();
    await rm(migrationDir, { recursive: true, force: true });
  });

  it('runs up under migrate, down under migrate:down, and both under migrate:refresh', async () => {
    await adapter.connection.collection('posts').insertOne({ title: 'Before' });

    await adapter.migrate();

    expect(await summaries()).toEqual(['up']);

    await adapter.migrateDown();

    expect(await summaries()).toEqual(['down']);

    await adapter.migrate();
    await adapter.migrateRefresh();

    expect(await summaries()).toEqual(['up']);
  });

  it('runs under migrate:fresh, which has no transaction', async () => {
    await adapter.migrateFresh({ forceAcceptWarning: true });

    const { docs } = await payload.find({ collection: 'payload-migrations', overrideAccess: true });

    expect(docs.map(({ name }) => name)).toEqual(['20260101_000000_summary']);
  });
});
