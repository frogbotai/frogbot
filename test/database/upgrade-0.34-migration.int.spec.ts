import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { MongooseAdapter } from '@frogbotai/db-mongodb';
import type { PostgresAdapter } from '@frogbotai/db-postgres';
import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import { sql } from 'drizzle-orm';
import { buildConfig, type FrogBotConfig } from 'frogbot';
import { type AuthorshipColumn, authorshipMigration } from 'frogbot/migrations';
import { dynamic } from 'frogbot/migrations/upgrade-0.34';
import { FrogBot, getFrogBotPayload } from 'frogbot/test';
import type { Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closePostgresPool, createPostgresDatabase } from '../__helpers/shared/db/postgres.js';

const adapterName = process.env.FROGBOT_DATABASE ?? 'sqlite';
const migrationDir = fileURLToPath(new URL(`./migrations-upgrade-${adapterName}`, import.meta.url));

type SnapshotTable = {
  name: string;
  columns: Record<string, Record<string, unknown>>;
  foreignKeys: Record<string, Record<string, unknown>>;
  indexes?: Record<string, unknown>;
};

describe.skipIf(!['sqlite', 'postgres'].includes(adapterName))(
  `Upgrade migration: ${adapterName}`,
  () => {
    let directory: string;
    let frogbot: FrogBot;
    let payload: Payload;
    let db: SQLiteAdapter | PostgresAdapter;
    let cleanupDatabase: (() => Promise<void>) | undefined;
    let userID: number;
    let postID: number;
    let adapterImport: string | undefined;

    const execute = (query: ReturnType<typeof sql>) =>
      db.execute({ db: db.drizzle as never, sql: query });

    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), 'frogbot-upgrade-migration-'));

      await rm(migrationDir, { recursive: true, force: true });

      let descriptor: FrogBotConfig['db'];

      if (adapterName === 'postgres') {
        const { postgresAdapter } = await import('../../packages/db-postgres/dist/index.js');
        const database = await createPostgresDatabase('upgrade_migration');
        const upstream = createRequire(
          new URL('../../packages/db-postgres/package.json', import.meta.url),
        ).resolve('@payloadcms/db-postgres');

        adapterImport = pathToFileURL(upstream).href;

        cleanupDatabase = async () => {
          await closePostgresPool((db as PostgresAdapter).pool);
          await database.drop();
        };

        descriptor = postgresAdapter({
          pool: { connectionString: database.url.toString() },
          push: false,
          migrationDir,
        });
      } else {
        const { sqliteAdapter } = await import('../../packages/db-sqlite/dist/index.js');

        descriptor = sqliteAdapter({
          client: { url: `file:${join(directory, 'authorship.db')}` },
          push: false,
          migrationDir,
        });
      }

      frogbot = await new FrogBot().init({
        config: await buildConfig({
          secret: 'frogbot-upgrade-migration-secret',
          db: descriptor,
          collections: [
            { slug: 'users', auth: true, fields: [] },
            { slug: 'posts', fields: [{ name: 'title', type: 'text' }] },
          ],
          typescript: { autoGenerate: false },
        }),
        disableOnInit: true,
      });

      payload = getFrogBotPayload(frogbot);
      db = payload.db as unknown as typeof db;

      await db.createMigration({ forceAcceptWarning: true, migrationName: 'initial', payload });

      const snapshotFile = (await readdir(migrationDir)).find((file) => file.endsWith('.json'))!;
      const snapshotPath = join(migrationDir, snapshotFile);
      const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
        tables: Record<string, SnapshotTable>;
      };

      const posts = Object.values(snapshot.tables).find(({ name }) => name === 'posts')!;

      posts.columns.created_by_id = {
        name: 'created_by_id',
        type: 'integer',
        primaryKey: false,
        notNull: false,
        ...(adapterName === 'sqlite' ? { autoincrement: false } : {}),
      };

      posts.foreignKeys.posts_created_by_id_users_id_fk = {
        name: 'posts_created_by_id_users_id_fk',
        tableFrom: 'posts',
        tableTo: 'users',
        columnsFrom: ['created_by_id'],
        columnsTo: ['id'],
        onDelete: 'set null',
        onUpdate: 'no action',
        ...(adapterName === 'postgres' ? { schemaTo: 'public' } : {}),
      };

      posts.columns.old_title = { ...posts.columns.title, name: 'old_title' };
      delete posts.columns.title;

      const [postsKey] = Object.entries(snapshot.tables).find(([, table]) => table === posts)!;
      const kvKey = Object.keys(snapshot.tables).find(
        (key) => snapshot.tables[key].name === 'payload_kv',
      )!;

      snapshot.tables[postsKey.replace('posts', 'legacy_folders')] = {
        ...structuredClone(posts),
        name: 'legacy_folders',
        foreignKeys: {},
        indexes: {},
      };

      delete snapshot.tables[kvKey];

      await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));

      for (const file of (await readdir(migrationDir)).filter((file) => file.endsWith('.ts'))) {
        const path = join(migrationDir, file);
        const source = await readFile(path, 'utf8');

        await writeFile(
          path,
          source.replace(
            /import \{([^}]*)\} from '((?:@frogbotai|@payloadcms)\/db-(?:sqlite|postgres))'/,
            (_, names: string, adapter: string) =>
              `import {${names.replace(/(?<!type )\b(Migrate(?:Down|Up)Args)\b/g, 'type $1')}} from '${adapterImport ?? adapter}'`,
          ),
        );
      }

      await db.migrate();
    });

    afterAll(async () => {
      await frogbot?.destroy();
      await cleanupDatabase?.();

      await rm(directory, { recursive: true, force: true });
      await rm(migrationDir, { recursive: true, force: true });
    });

    it('lists the 3.x author column and keeps it in the snapshot', async () => {
      const filePath = join(migrationDir, '20260101_000000_upgrade');
      const template = await dynamic({ filePath, migrationName: 'upgrade', payload } as never);

      expect(template.imports).toContain(
        "{ table: 'posts', column: 'created_by_id', relationTo: 'users', to: 'createdBy' }",
      );

      const written = JSON.parse(await readFile(`${filePath}.json`, 'utf8')) as {
        tables: Record<string, SnapshotTable>;
      };

      const posts = Object.values(written.tables).find(({ name }) => name === 'posts')!;

      expect(posts.columns.created_by_id).toBeDefined();
      expect(template.upSQL).toContain('await authorshipMigration(');
    });

    it('writes the schema change without asking about renames', async () => {
      const filePath = join(migrationDir, '20260101_000001_upgrade');
      const template = await dynamic({ filePath, migrationName: 'upgrade', payload } as never);
      const [up, down] = [template.upSQL, template.downSQL].map((text) =>
        text?.replaceAll(/[\\`"]/g, ''),
      );

      expect(up).toContain('CREATE TABLE payload_kv');
      expect(up).toContain('DROP TABLE legacy_folders');
      expect(up).toMatch(/ALTER TABLE posts ADD (COLUMN )?title/);
      expect(up).toContain('ALTER TABLE posts DROP COLUMN old_title');
      expect(up).not.toContain('RENAME COLUMN');
      expect(down).toContain('DROP TABLE payload_kv');
      expect(down).toContain('ALTER TABLE posts DROP COLUMN title');
    });

    it('copies each stored author into createdBy', async () => {
      const user = await payload.create({
        collection: 'users',
        data: { email: 'author@example.com', password: 'secret-password' },
        overrideAccess: true,
      });

      const post = await payload.create({
        collection: 'posts',
        data: { title: 'From 3.x' },
        overrideAccess: true,
      });

      userID = user.id as number;
      postID = post.id as number;

      await execute(sql`alter table ${sql.identifier('posts')} add column created_by_id integer`);

      await execute(
        sql`update ${sql.identifier('posts')} set created_by_id = ${userID} where id = ${postID}`,
      );

      const columns: AuthorshipColumn[] = [
        { table: 'posts', column: 'created_by_id', relationTo: 'users', to: 'createdBy' },
      ];

      await authorshipMigration({ db: db.drizzle, payload, columns });
      await authorshipMigration({ db: db.drizzle, payload, columns });

      const migrated = await payload.findByID({
        collection: 'posts',
        id: postID,
        depth: 0,
        overrideAccess: true,
      });

      expect(migrated.createdBy).toEqual({ relationTo: 'users', value: userID });
    });
  },
);

describe.skipIf(adapterName !== 'mongodb')('Upgrade migration: mongodb', () => {
  let frogbot: FrogBot;
  let payload: Payload;

  beforeAll(async () => {
    const { databaseAdapter } = await import('../databaseAdapter.js');

    frogbot = await new FrogBot().init({
      config: await buildConfig({
        secret: 'frogbot-upgrade-migration-secret',
        db: databaseAdapter,
        collections: [
          { slug: 'users', auth: true, fields: [] },
          { slug: 'posts', fields: [{ name: 'title', type: 'text' }] },
        ],
        typescript: { autoGenerate: false },
      }),
      disableOnInit: true,
    });

    payload = getFrogBotPayload(frogbot);
  });

  afterAll(async () => {
    await (payload?.db as unknown as MongooseAdapter | undefined)?.connection.dropDatabase();
    await frogbot?.destroy();
  });

  it('moves each stored author key into createdBy and updatedBy', async () => {
    const user = await payload.create({
      collection: 'users',
      data: { email: 'author@example.com', password: 'secret-password' },
      overrideAccess: true,
    });

    const post = await payload.create({
      collection: 'posts',
      data: { title: 'From 3.x' },
      overrideAccess: true,
    });

    const models = (payload.db as unknown as { collections: Record<string, Model> }).collections;

    await models.posts.collection.updateOne(
      { title: post.title },
      { $set: { lastModifiedBy: user.id }, $unset: { createdBy: '', updatedBy: '' } },
    );

    await authorshipMigration({ payload, keys: { lastModifiedBy: 'updatedBy' } });

    const migrated = await models.posts.collection.findOne({ title: post.title });

    expect(migrated).toMatchObject({ updatedBy: { relationTo: 'users', value: user.id } });
    expect(migrated).not.toHaveProperty('lastModifiedBy');
  });
});

type Model = {
  collection: {
    findOne(filter: object): Promise<null | Record<string, unknown>>;
    updateOne(filter: object, update: object): Promise<unknown>;
  };
};
