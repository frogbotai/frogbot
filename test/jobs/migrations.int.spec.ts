import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { PostgresAdapter } from '@frogbotai/db-postgres';
import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig, type FrogBotConfig } from 'frogbot';
import { FrogBot, getFrogBotPayload } from 'frogbot/test';
import type { Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closePostgresPool, createPostgresDatabase } from '../__helpers/shared/db/postgres.js';
import { adapterName } from './fixture.js';

const migrationDir = fileURLToPath(new URL(`./migrations-${adapterName}`, import.meta.url));

describe.skipIf(!['sqlite', 'postgres'].includes(adapterName))(
  `jobs migrations: ${adapterName}`,
  () => {
    let directory: string;
    let frogbot: FrogBot;
    let payload: Payload;
    let db: SQLiteAdapter | PostgresAdapter;
    let initialSQL: string;
    let cleanupDatabase: (() => Promise<void>) | undefined;
    let adapterImport: string | undefined;

    const migrationSource = async (name: string) => {
      const file = (await readdir(migrationDir)).find((file) => file.endsWith(`_${name}.ts`));

      expect(file).toBeDefined();

      return readFile(join(migrationDir, file!), 'utf8');
    };

    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), 'frogbot-jobs-migrations-'));

      await rm(migrationDir, { recursive: true, force: true });

      let descriptor: FrogBotConfig['db'];

      if (adapterName === 'postgres') {
        const { postgresAdapter } = await import('../../packages/db-postgres/dist/index.js');
        const database = await createPostgresDatabase('ticket192');
        const upstream = createRequire(
          new URL('../../packages/db-postgres/package.json', import.meta.url),
        ).resolve('@payloadcms/db-postgres');

        cleanupDatabase = async () => {
          await closePostgresPool((db as PostgresAdapter).pool);
          await database.drop();
        };

        adapterImport = pathToFileURL(upstream).href;
        descriptor = postgresAdapter({
          pool: { connectionString: database.url.toString() },
          push: false,
          migrationDir,
        });
      } else {
        const { sqliteAdapter } = await import('../../packages/db-sqlite/dist/index.js');

        descriptor = sqliteAdapter({
          client: { url: `file:${join(directory, 'jobs.db')}` },
          push: false,
          migrationDir,
        });
      }

      frogbot = await new FrogBot().init({
        config: await buildConfig({
          secret: 'frogbot-jobs-migrations-secret',
          db: descriptor,
          admin: { disable: true },
          collections: [],
          typescript: { autoGenerate: false },
          jobs: { autoRun: [], tasks: [{ slug: 'noop', handler: async () => ({ output: {} }) }] },
        }),
        disableOnInit: true,
      });

      payload = getFrogBotPayload(frogbot);
      db = payload.db as unknown as typeof db;

      await db.createMigration({ forceAcceptWarning: true, migrationName: 'initial', payload });

      const source = await migrationSource('initial');

      initialSQL = source.split('export async function down')[0].replace(/\\`/g, '`');

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

    it('the generated migration creates the live jobId partial unique index', () => {
      const indexes = initialSQL.match(/CREATE (?:UNIQUE )?INDEX[^;]+;/g) ?? [];

      const jobIdIndexes = indexes.filter(
        (statement) =>
          /ON ["`]payload_jobs["`]/.test(statement) && /["`]job_id["`]/.test(statement),
      );

      expect(jobIdIndexes).toHaveLength(1);
      expect(jobIdIndexes[0]).toMatch(/CREATE UNIQUE INDEX ["`]payload_jobs_job_id_live_idx["`]/);
      expect(jobIdIndexes[0]).toMatch(
        /WHERE .+job_id.+ is not null and .+completed_at.+ is null and coalesce\(.+has_error.+, (?:0|false)\) = (?:0|false)/,
      );
    });

    it('the generated migration links waitpoints to their holder job', () => {
      const waitpointsTable = initialSQL.match(
        /CREATE TABLE ["`]frogbot_waitpoints["`][\s\S]+?;/,
      )?.[0];

      expect(waitpointsTable).toMatch(/["`]holder_id["`] (?:integer|int|uuid)/);
      expect(initialSQL).toMatch(
        /FOREIGN KEY \(["`]holder_id["`]\) REFERENCES (?:["`]public["`]\.)?["`]payload_jobs["`]\(["`]id["`]\)(?: ON UPDATE no action)? ON DELETE (?:set null|SET NULL)/,
      );
      expect(initialSQL).toMatch(
        /CREATE INDEX ["`]frogbot_waitpoints_holder_idx["`] ON ["`]frogbot_waitpoints["`](?: USING btree)? \(["`]holder_id["`]\)/,
      );
      expect(waitpointsTable).not.toMatch(/["`]snapshot["`]/);
    });

    it('regenerating the migration produces no changes', async () => {
      await db.createMigration({ forceAcceptWarning: true, migrationName: 'unchanged', payload });

      const source = await migrationSource('unchanged');

      expect(source).not.toMatch(/db\.(?:run|execute)\(/);
    });

    it('the migrated schema reserves only live jobIds', async () => {
      const data = { taskSlug: 'noop', queue: 'default', jobId: randomUUID(), hasError: false };

      const first = await payload.db.create({ collection: 'payload-jobs', data });

      await expect(
        payload.db.create({ collection: 'payload-jobs', data: { ...data } }),
      ).rejects.toThrow();

      await payload.db.updateOne({
        collection: 'payload-jobs',
        id: first.id,
        data: { hasError: true },
      });

      const second = await payload.db.create({ collection: 'payload-jobs', data: { ...data } });

      expect(second.id).not.toBe(first.id);
    });
  },
);
