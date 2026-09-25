import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresClient, defaultPostgresURL } from '../../__helpers/shared/db/postgres.js';
import { createSearchDatabase, describePostgres, driver, type SearchDatabase } from './fixture.js';
import { articles, articlesSlug, guides, guidesSlug, localization } from './shared.js';

const notes = {
  slug: 'notes',
  fields: [{ name: 'title', type: 'text' as const }],
  search: { notes: { lexical: { fields: ['title'] } } },
};

const plain = {
  slug: 'plain',
  fields: [{ name: 'embedding', type: 'vector' as const, dimensions: 3 }],
};

async function getColumnType(database: SearchDatabase, table: string, column: string) {
  const { rows } = await database.client.query<{ type: string }>(
    `select format_type(atttypid, atttypmod) as type from pg_attribute where attrelid = $1::regclass and attname = $2`,
    [table, column],
  );

  return rows[0]?.type;
}

async function getIndexes(database: SearchDatabase) {
  const { rows } = await database.client.query<{ indexdef: string; indexname: string }>(
    `select indexname, indexdef from pg_indexes where schemaname = 'public' order by indexname`,
  );

  return rows;
}

async function getVectorVersion(database: SearchDatabase) {
  const { rows } = await database.client.query<{ version: string }>(
    `select extversion as version from pg_extension where extname = 'vector'`,
  );

  return rows[0]?.version;
}

async function linkAdapterPackages(directory: string) {
  for (const name of ['db-postgres', 'db-vercel-postgres']) {
    const target = fileURLToPath(
      new URL(`../../../packages/${name}/node_modules/@payloadcms/${name}`, import.meta.url),
    );

    const link = join(directory, 'node_modules', '@payloadcms', name);

    await mkdir(dirname(link), { recursive: true });
    await symlink(target, link, 'dir');
  }
}

describePostgres(`postgres search setup [${driver}]`, () => {
  describe('lexical-only indexes', () => {
    let database: SearchDatabase;

    beforeAll(async () => {
      database = await createSearchDatabase();
    });

    afterAll(async () => {
      await database?.shutdown();
    });

    it('boots without installing pgvector and creates a text search index', async () => {
      const { frogbot } = await database.boot({ collections: [notes] });

      expect(await getVectorVersion(database)).toBeUndefined();

      expect(await getIndexes(database)).toContainEqual({
        indexname: 'notes_notes_search_idx',
        indexdef: expect.stringContaining(
          "USING gin (to_tsvector('simple'::regconfig, (COALESCE(title, ''::character varying))::text))",
        ),
      });

      await frogbot.create({ collection: 'notes', data: { title: 'Reset a password' } });

      const result = await frogbot.search({
        collection: 'notes',
        index: 'notes',
        query: { text: 'password' },
        overrideAccess: true,
      });

      expect(result.hits.map(({ doc }) => doc.title)).toEqual(['Reset a password']);
    });
  });

  describe('vector indexes', () => {
    let database: SearchDatabase;
    let booted: Awaited<ReturnType<SearchDatabase['boot']>>;

    beforeAll(async () => {
      database = await createSearchDatabase();
      booted = await database.boot({ collections: [articles, guides, plain], localization });
    });

    afterAll(async () => {
      await database?.shutdown();
    });

    it('installs pgvector 0.8.0 or later', async () => {
      const version = await getVectorVersion(database);

      expect(version).toBeDefined();
      expect(version!.localeCompare('0.8.0', undefined, { numeric: true })).toBeGreaterThanOrEqual(
        0,
      );
    });

    it('stores selected vector fields as native columns and keeps other vector fields as JSON', async () => {
      expect(await getColumnType(database, 'articles', 'embedding')).toBe('vector(3)');
      expect(await getColumnType(database, '_articles_v', 'version_embedding')).toBe('vector(3)');
      expect(await getColumnType(database, 'guides_locales', 'meta_embedding')).toBe('vector(3)');
      expect(await getColumnType(database, 'plain', 'embedding')).toBe('jsonb');
    });

    it('creates HNSW indexes per metric and text search indexes for the main and versions tables', async () => {
      const definitions = (await getIndexes(database)).map(({ indexdef }) => indexdef);

      for (const expected of [
        'ON public.articles USING hnsw (embedding vector_cosine_ops)',
        'ON public.articles USING hnsw (embedding vector_l2_ops)',
        'ON public.articles USING hnsw (embedding vector_ip_ops)',
        'ON public._articles_v USING hnsw (version_embedding vector_cosine_ops)',
        'ON public.guides_locales USING hnsw (meta_embedding vector_cosine_ops)',
        "ON public.articles USING gin (to_tsvector('english'::regconfig",
        "ON public._articles_v USING gin (to_tsvector('english'::regconfig",
      ]) {
        expect(definitions.some((definition) => definition.includes(expected))).toBe(true);
      }

      expect(definitions.some((definition) => definition.includes('public.guides USING gin'))).toBe(
        false,
      );
    });

    it('round-trips vectors through create, read, update, and delete', async () => {
      const { frogbot } = booted;

      const created = await frogbot.create({
        collection: articlesSlug,
        data: { title: 'Round trip', embedding: [0.5, -1, 2], _status: 'published' },
        overrideAccess: true,
      });

      expect(created.embedding).toEqual([0.5, -1, 2]);

      const updated = await frogbot.update({
        collection: articlesSlug,
        id: created.id,
        data: { embedding: [1, 2, 3] },
        overrideAccess: true,
      });

      expect(updated.embedding).toEqual([1, 2, 3]);

      const cleared = await frogbot.update({
        collection: articlesSlug,
        id: created.id,
        data: { embedding: null },
        overrideAccess: true,
      });

      expect(cleared.embedding ?? null).toBeNull();

      await frogbot.delete({ collection: articlesSlug, id: created.id, overrideAccess: true });

      await expect(
        frogbot.find({
          collection: articlesSlug,
          where: { id: { equals: created.id } },
          overrideAccess: true,
        }),
      ).resolves.toMatchObject({ totalDocs: 0 });
    });

    it('round-trips draft, localized, and JSON vectors', async () => {
      const { frogbot } = booted;

      const draft = await frogbot.create({
        collection: articlesSlug,
        data: { title: 'Draft only', embedding: [3, 2, 1] },
        draft: true,
        overrideAccess: true,
      });

      const draftRead = await frogbot.findByID({
        collection: articlesSlug,
        id: draft.id,
        draft: true,
        overrideAccess: true,
      });

      expect(draftRead.embedding).toEqual([3, 2, 1]);

      const guide = await frogbot.create({
        collection: guidesSlug,
        data: { title: 'Hello', meta: { embedding: [1, 0, 0] } },
        locale: 'en',
        overrideAccess: true,
      });

      await frogbot.update({
        collection: guidesSlug,
        id: guide.id,
        data: { title: 'Hola', meta: { embedding: [0, 1, 0] } },
        locale: 'es',
        overrideAccess: true,
      });

      const [english, spanish] = await Promise.all(
        (['en', 'es'] as const).map((locale) =>
          frogbot.findByID({ collection: guidesSlug, id: guide.id, locale, overrideAccess: true }),
        ),
      );

      expect(english.meta?.embedding).toEqual([1, 0, 0]);
      expect(spanish.meta?.embedding).toEqual([0, 1, 0]);

      const json = await frogbot.create({
        collection: 'plain',
        data: { embedding: [4, 5, 6] },
        overrideAccess: true,
      });

      expect(json.embedding).toEqual([4, 5, 6]);
    });

    it('pushes the same schema again without changes or data loss', async () => {
      const { frogbot } = booted;

      const created = await frogbot.create({
        collection: articlesSlug,
        data: { title: 'Survives a second push', embedding: [1, 1, 1], _status: 'published' },
        overrideAccess: true,
      });

      const second = await database.boot({ collections: [articles, guides, plain], localization });

      const read = await second.frogbot.findByID({
        collection: articlesSlug,
        id: created.id,
        overrideAccess: true,
      });

      expect(read.embedding).toEqual([1, 1, 1]);
    });
  });

  describe('migrations', () => {
    let database: SearchDatabase;
    let directory: string;

    beforeAll(async () => {
      database = await createSearchDatabase();
      directory = await mkdtemp(join(tmpdir(), 'frogbot-search-migrations-'));
      await linkAdapterPackages(directory);
    });

    afterAll(async () => {
      await database?.shutdown();
      await rm(directory, { recursive: true, force: true });
    });

    it('reports readiness before migrations and emits search DDL into migrations', async () => {
      const migrationDir = join(directory, 'migrations');
      const { frogbot, payload } = await database.boot({
        collections: [articles],
        migrationDir,
        push: false,
      });

      await expect(
        frogbot.search({
          collection: articlesSlug,
          index: 'content',
          query: { text: 'anything' },
          overrideAccess: true,
        }),
      ).rejects.toMatchObject({ name: 'SearchReadinessError', status: 503 });

      await payload.db.createMigration({
        migrationName: 'search',
        payload,
        forceAcceptWarning: true,
      });

      const [file] = (await readdir(migrationDir)).filter((name) => name.endsWith('.ts'));
      const migration = await readFile(join(migrationDir, file), 'utf8');

      expect(migration).toContain('"embedding" vector(3)');
      expect(migration).toContain('USING hnsw ("embedding" vector_cosine_ops)');
      expect(migration).toContain(
        `USING gin (to_tsvector('english'::regconfig, coalesce("title", '') || ' ' || coalesce("body", '')))`,
      );

      const { down, up } = await import(pathToFileURL(join(migrationDir, file)).href);
      const migrations = [{ name: file.replace(/\.ts$/, ''), down, up }];

      await payload.db.migrate({ migrations });
      await payload.db.migrate({ migrations });

      await frogbot.create({
        collection: articlesSlug,
        data: { title: 'Migrated', embedding: [1, 0, 0], _status: 'published' },
        overrideAccess: true,
      });

      const result = await frogbot.search({
        collection: articlesSlug,
        index: 'content',
        query: { text: 'migrated', vector: [1, 0, 0] },
        overrideAccess: true,
      });

      expect(result.hits.map(({ doc }) => doc.title)).toEqual(['Migrated']);
    });
  });

  describe('setup errors', () => {
    let database: SearchDatabase;
    const admin = createPostgresClient(process.env.POSTGRES_URL ?? defaultPostgresURL);
    const role = `frogbot_search_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

    beforeAll(async () => {
      await admin.connect();
      await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD 'limited' NOSUPERUSER`);

      database = await createSearchDatabase();

      await database.client.query(`GRANT CREATE, USAGE ON SCHEMA public TO "${role}"`);
    });

    afterAll(async () => {
      await database?.shutdown();
      await admin.query(`DROP ROLE IF EXISTS "${role}"`);
      await admin.end();
    });

    it('fails with permission-denied when the role cannot create pgvector, then boots with JSON vectors', async () => {
      const url = new URL(database.url);

      url.username = role;
      url.password = 'limited';

      await expect(
        database.boot({ collections: [articles], connectionString: url.toString() }),
      ).rejects.toThrow(
        /Search index 'content' in collection 'articles' \(vector\): permission-denied: .*SQLSTATE 42501/,
      );

      expect(await getVectorVersion(database)).toBeUndefined();

      const { frogbot } = await database.boot({
        collections: [plain],
        connectionString: url.toString(),
      });

      const created = await frogbot.create({
        collection: 'plain',
        data: { embedding: [1, 2, 3] },
        overrideAccess: true,
      });

      expect(created.embedding).toEqual([1, 2, 3]);
      expect(await getColumnType(database, 'plain', 'embedding')).toBe('jsonb');
    });
  });
});
