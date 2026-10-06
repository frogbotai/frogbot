import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { PostgresAdapter } from '@frogbotai/db-postgres';
import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig, type FrogBotConfig } from 'frogbot';
import { FrogBot, getFrogBotPayload } from 'frogbot/test';
import type { Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHAT_ASSETS_SLUG } from '../../packages/frogbot/src/chat/collections/assets.js';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';
import { closePostgresPool, createPostgresDatabase } from '../__helpers/shared/db/postgres.js';
import { reportDocx, reportText } from '../__helpers/shared/office.js';
import { agentSlug, chatsSlug, usersSlug } from './shared.js';

const adapterName = getCurrentDatabaseAdapter();
const migrationDir = fileURLToPath(new URL(`./migrations-${adapterName}`, import.meta.url));
const assetsTable = 'frogbot_chat_assets';
const oldAssetId = 1000;
const oldDocumentId = 1001;
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Asset = {
  id: number | string;
  filename: string;
  sha256?: string | null;
  text?: string | null;
};

type AssetColumn = 'sha256' | 'text';

const quoted = (name: string) => `\\\\?["\`]${name}\\\\?["\`]`;

const createAssetsTable = new RegExp(`CREATE TABLE ${quoted(assetsTable)}[\\s\\S]+?;`);

const columnLine = (column: AssetColumn) =>
  new RegExp(`\\n\\s*${quoted(column)} (?:text|varchar),`);

const addColumnStatement = (column: AssetColumn) => {
  const statement = `ALTER TABLE ${quoted(assetsTable)} ADD (?:COLUMN )?${quoted(column)}[^;]*;`;

  return new RegExp(`\\n\\s*(?:await db\\.run\\(sql\`${statement}\`\\)|${statement})`);
};

describe.skipIf(!['sqlite', 'postgres'].includes(adapterName))(
  `chat assets migrations: ${adapterName}`,
  () => {
    let directory: string;
    let frogbot: FrogBot;
    let payload: Payload;
    let db: SQLiteAdapter | PostgresAdapter;
    let initialSQL: string;
    let hashSQL: string;
    let textSQL: string;
    let cleanupDatabase: (() => Promise<void>) | undefined;
    let adapterImport: string | undefined;

    const migrationFile = async ({ name, extension }: { name: string; extension: string }) => {
      const file = (await readdir(migrationDir)).find((file) =>
        file.endsWith(`_${name}${extension}`),
      );

      expect(file).toBeDefined();

      return join(migrationDir, file!);
    };

    const upSQL = (source: string) =>
      source.split('export async function down')[0].replace(/\\`/g, '`');

    const readMigration = async (name: string) =>
      readFile(await migrationFile({ name, extension: '.ts' }), 'utf8');

    const createMigration = async (name: string) => {
      await db.createMigration({ forceAcceptWarning: true, migrationName: name, payload });

      return readMigration(name);
    };

    const fixMigrationImports = async () => {
      for (const file of (await readdir(migrationDir)).filter((file) => file.endsWith('.ts'))) {
        const filePath = join(migrationDir, file);
        const source = await readFile(filePath, 'utf8');

        await writeFile(
          filePath,
          source.replace(
            /import \{([^}]*)\} from '((?:@frogbotai|@payloadcms)\/db-(?:sqlite|postgres))'/,
            (_, names: string, adapter: string) =>
              `import {${names.replace(/(?<!type )\b(Migrate(?:Down|Up)Args)\b/g, 'type $1')}} from '${adapterImport ?? adapter}'`,
          ),
        );
      }
    };

    const removeColumn = async ({
      migration,
      column,
    }: {
      migration: string;
      column: AssetColumn;
    }) => {
      const sourcePath = await migrationFile({ name: migration, extension: '.ts' });
      const source = await readFile(sourcePath, 'utf8');

      const removed = source
        .replace(createAssetsTable, (statement) => statement.replace(columnLine(column), ''))
        .replace(addColumnStatement(column), '');

      await writeFile(sourcePath, removed);

      const snapshotPath = await migrationFile({ name: migration, extension: '.json' });
      const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
        tables: Record<string, { columns: Record<string, unknown> }>;
      };
      const table = Object.entries(snapshot.tables).find(([name]) =>
        name.endsWith(assetsTable),
      )?.[1];

      delete table?.columns[column];

      await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
    };

    const insertOldAsset = async ({
      id,
      filename,
      mimeType,
    }: {
      id: number;
      filename: string;
      mimeType: string;
    }) => {
      const createdAt = '2026-01-01T00:00:00.000Z';
      const raw = `INSERT INTO "${assetsTable}" ("id", "filename", "mime_type", "filesize", "updated_at", "created_at") VALUES (${id}, '${filename}', '${mimeType}', 3, '${createdAt}', '${createdAt}')`;

      if ('pool' in db) {
        await db.execute({ drizzle: db.drizzle, raw });
      } else {
        await db.client.execute(raw);
      }
    };

    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), 'frogbot-chat-migrations-'));

      await rm(migrationDir, { recursive: true, force: true });

      let descriptor: FrogBotConfig['db'];

      if (adapterName === 'postgres') {
        const { postgresAdapter } = await import('../../packages/db-postgres/dist/index.js');
        const database = await createPostgresDatabase('ticket193');
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
          client: { url: `file:${join(directory, 'chat.db')}` },
          push: false,
          migrationDir,
        });
      }

      frogbot = await new FrogBot().init({
        config: await buildConfig({
          secret: 'frogbot-chat-migrations-secret',
          db: descriptor,
          typescript: { autoGenerate: false },
          collections: [
            { slug: usersSlug, auth: true, fields: [] },
            { slug: chatsSlug, chat: true, fields: [] },
          ],
          ai: {
            defaultModel: 'test/gpt-4.1-mini',
            providers: {
              test: {
                type: 'openai-compatible',
                baseUrl: 'http://127.0.0.1:3988/v1',
                apiKey: 'test-key',
                models: [{ id: 'gpt-4.1-mini', mode: 'chat' }],
              },
            },
          },
          agents: [
            {
              slug: agentSlug,
              model: 'test/gpt-4.1-mini',
              instructions: 'Help the user.',
              access: () => true,
            },
          ],
        }),
        disableOnInit: true,
      });

      payload = getFrogBotPayload(frogbot);
      db = payload.db as unknown as typeof db;

      initialSQL = upSQL(await createMigration('initial'));

      await removeColumn({ migration: 'initial', column: 'sha256' });
      await removeColumn({ migration: 'initial', column: 'text' });
      await fixMigrationImports();
      await db.migrate();
      await insertOldAsset({ id: oldAssetId, filename: 'old.txt', mimeType: 'text/plain' });

      await createMigration('sha256');
      await removeColumn({ migration: 'sha256', column: 'text' });

      hashSQL = upSQL(await readMigration('sha256'));

      await fixMigrationImports();
      await db.migrate();
      await insertOldAsset({ id: oldDocumentId, filename: 'old.docx', mimeType: DOCX_TYPE });

      textSQL = upSQL(await createMigration('text'));

      await fixMigrationImports();
      await db.migrate();
    });

    afterAll(async () => {
      await frogbot?.destroy();
      await cleanupDatabase?.();

      await rm(directory, { recursive: true, force: true });
      await rm(migrationDir, { recursive: true, force: true });
      await rm(path.resolve(CHAT_ASSETS_SLUG), { recursive: true, force: true });
    });

    it('the generated initial migration creates the hash and text columns on chat assets', () => {
      const table = initialSQL.match(createAssetsTable)?.[0];

      expect(table).toMatch(/["`]sha256["`] (?:text|varchar)/);
      expect(table).toMatch(/["`]text["`] (?:text|varchar)/);
    });

    it('a migration for an existing database only adds the hash column', () => {
      const statements = hashSQL.match(/(?:CREATE|ALTER|DROP)[^;]+;/g) ?? [];

      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatch(
        new RegExp(
          `ALTER TABLE ["\`]${assetsTable}["\`] ADD (?:COLUMN )?["\`]sha256["\`] (?:text|varchar)`,
        ),
      );
    });

    it('a migration for a database with chat-asset hashes only adds the text column', () => {
      const statements = textSQL.match(/(?:CREATE|ALTER|DROP)[^;]+;/g) ?? [];

      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatch(
        new RegExp(
          `ALTER TABLE ["\`]${assetsTable}["\`] ADD (?:COLUMN )?["\`]text["\`] (?:text|varchar)`,
        ),
      );
    });

    it('regenerating the migration produces no changes', async () => {
      const source = await createMigration('unchanged');

      expect(source).not.toMatch(/db\.(?:run|execute)\(/);
    });

    it('an asset saved before the migration still reads with no hash', async () => {
      const asset = (await frogbot.findByID({
        collection: CHAT_ASSETS_SLUG,
        id: oldAssetId,
        overrideAccess: true,
        showHiddenFields: true,
      })) as Asset;

      expect(asset.filename).toBe('old.txt');
      expect(asset.sha256 ?? null).toBeNull();
    });

    it('a Word document saved before the text migration still reads with no text', async () => {
      const asset = (await frogbot.findByID({
        collection: CHAT_ASSETS_SLUG,
        id: oldDocumentId,
        overrideAccess: true,
      })) as Asset;

      expect(asset.filename).toBe('old.docx');
      expect(asset.text ?? null).toBeNull();
    });

    it('a new upload stores the hash of its contents after migrating', async () => {
      const data = Buffer.from('fresh upload');

      const created = (await frogbot.create({
        collection: CHAT_ASSETS_SLUG,
        data: {},
        file: { data, mimetype: 'text/plain', name: 'fresh.txt', size: data.byteLength },
        overrideAccess: true,
      })) as Asset;

      const stored = (await frogbot.findByID({
        collection: CHAT_ASSETS_SLUG,
        id: created.id,
        overrideAccess: true,
        showHiddenFields: true,
      })) as Asset;

      expect(stored.sha256).toBe(createHash('sha256').update(data).digest('hex'));
    });

    it('a new Word upload stores its text after migrating', async () => {
      const data = Buffer.from(reportDocx());

      const created = (await frogbot.create({
        collection: CHAT_ASSETS_SLUG,
        data: {},
        file: { data, mimetype: DOCX_TYPE, name: 'fresh.docx', size: data.byteLength },
        overrideAccess: true,
      })) as Asset;

      const stored = (await frogbot.findByID({
        collection: CHAT_ASSETS_SLUG,
        id: created.id,
        overrideAccess: true,
      })) as Asset;

      expect(stored.text).toBe(reportText);
    });
  },
);
