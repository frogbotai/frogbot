import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { MongooseAdapter } from '@frogbotai/db-mongodb';
import { buildConfig } from 'frogbot';
import { FrogBot, getFrogBotPayload } from 'frogbot/test';
import type { Payload } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const builtAdapter = pathToFileURL(
  fileURLToPath(new URL('../../packages/db-mongodb/dist/index.js', import.meta.url)),
).href;

const documented = `import { type MigrateUpArgs, migrationDatabase } from '${builtAdapter}'

export async function up({ req, session }: MigrateUpArgs): Promise<void> {
  await migrationDatabase(req)
    .collection('posts')
    .updateMany({ summary: { $exists: false } }, { $set: { summary: '' } }, { session })
}

export async function down(): Promise<void> {}
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
    adapter = payload.db as MongooseAdapter;
    migrationDir = await mkdtemp(join(import.meta.dirname, 'migrations-mongo-'));
    adapter.migrationDir = migrationDir;

    await writeFile(join(migrationDir, '20260101_000000_summary.ts'), documented);
  });

  beforeEach(async () => {
    await adapter.connection.collection('posts').insertOne({ title: 'Before' });
  });

  afterAll(async () => {
    await adapter?.connection.dropDatabase();
    await frogbot?.destroy();
    await rm(migrationDir, { recursive: true, force: true });
  });

  it('runs the documented migration under migrate', async () => {
    await adapter.migrate();

    expect(await summaries()).toEqual(['']);
  });

  it('runs the documented migration under migrate:fresh, which has no session', async () => {
    await adapter.migrateFresh({ forceAcceptWarning: true });

    const { docs } = await payload.find({ collection: 'payload-migrations', overrideAccess: true });

    expect(docs.map(({ name }) => name)).toEqual(['20260101_000000_summary']);
  });
});
