import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { AuthStrategy } from 'frogbot';
import type { Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { FrogBot, getFrogBotPayload } from '../../packages/frogbot/src/frogbot.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const failAfterWrite = ({ context }: { context: Record<string, unknown> }) => {
  if (context.fail) throw new Error('hook failed after the write');
};

const editorHeaderStrategy: AuthStrategy = {
  name: 'editor-header',
  authenticate: async ({ canSetHeaders, frogbot, headers }) => {
    const email = headers.get('x-editor');

    if (!email) return { user: null };

    const { docs } = await frogbot.find({
      collection: 'editors',
      limit: 1,
      where: { email: { equals: email } },
    });

    return {
      responseHeaders: canSetHeaders ? new Headers({ 'x-editor-strategy': 'set' }) : undefined,
      user: docs[0] ? { ...docs[0], collection: 'editors' } : null,
    };
  },
};

describe(`local API write options [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let payload: Payload;
  let databaseDir: string;
  let editorID: number | string;
  let filesDir: string;

  const writeFixture = async (name: string, text: string) => {
    const filePath = join(databaseDir, 'fixtures', name);

    await writeFile(filePath, text);

    return filePath;
  };
  const createAttachment = (filePath: string, overwriteExistingFiles?: boolean) =>
    frogbot.create({
      collection: 'attachments',
      data: {},
      filePath,
      overwriteExistingFiles,
    }) as Promise<{ id: number | string; filename: string }>;

  const create = (title: string) =>
    frogbot.create({ collection: 'notes', data: { title } }) as Promise<{
      id: number | string;
      title: string;
    }>;
  const count = async (title: string) =>
    (await frogbot.count({ collection: 'notes', where: { title: { equals: title } } })).totalDocs;
  const lock = (id: number | string) =>
    payload.create({
      collection: 'payload-locked-documents',
      data: {
        document: { relationTo: 'notes', value: id },
        user: { relationTo: 'editors', value: editorID },
      },
    });

  beforeAll(async () => {
    databaseDir = await mkdtemp(join(tmpdir(), 'frogbot-local-api-'));
    filesDir = join(databaseDir, 'files');
    await mkdir(join(databaseDir, 'fixtures'));
    const config = await buildConfig({
      secret: 'local-api-options-test-secret',
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({
          client: { url: `file:${join(databaseDir, 'local-api.db')}` },
          transactionOptions: {},
        }),
      }),
      admin: { user: 'editors', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
      experimental: { localizeStatus: true },
      collections: [
        { slug: 'editors', auth: { strategies: [editorHeaderStrategy] }, fields: [] },
        {
          slug: 'notes',
          hooks: { afterChange: [failAfterWrite], afterDelete: [failAfterWrite] },
          fields: [{ name: 'title', type: 'text' }],
        },
        { slug: 'attachments', upload: { staticDir: filesDir }, fields: [] },
        {
          slug: 'articles',
          versions: { drafts: { localizeStatus: true } },
          fields: [{ name: 'title', type: 'text', localized: true }],
        },
      ],
    });
    frogbot = await new FrogBot().init({ config, disableOnInit: true });
    payload = getFrogBotPayload(frogbot);
    editorID = (
      await frogbot.create({
        collection: 'editors',
        data: { email: 'editor@example.com', password: 'editor-password' },
      })
    ).id;
  });

  afterAll(async () => {
    await frogbot?.destroy();
    await rm(databaseDir, { recursive: true, force: true });
  });

  describe('overrideLock', () => {
    it('ignores locks by default and enforces them on update when false', async () => {
      const note = await create('locked-update');
      await lock(note.id);

      await expect(
        frogbot.update({
          collection: 'notes',
          id: note.id,
          data: { title: 'blocked' },
          overrideLock: false,
        }),
      ).rejects.toThrow(`Document with ID ${note.id} is currently locked`);

      const many = await frogbot.update({
        collection: 'notes',
        where: { id: { equals: note.id } },
        data: { title: 'blocked' },
        overrideLock: false,
      });
      expect(many.docs).toEqual([]);
      expect(many.errors).toEqual([
        expect.objectContaining({ id: note.id, message: expect.stringContaining('locked') }),
      ]);
      expect(await count('locked-update')).toBe(1);

      await expect(
        frogbot.update({ collection: 'notes', id: note.id, data: { title: 'unlocked-update' } }),
      ).resolves.toMatchObject({ title: 'unlocked-update' });
    });

    it('enforces locks on delete when false', async () => {
      const note = await create('locked-delete');
      await lock(note.id);

      await expect(
        frogbot.delete({ collection: 'notes', id: note.id, overrideLock: false }),
      ).rejects.toThrow(`Document with ID ${note.id} is currently locked`);

      const many = await frogbot.delete({
        collection: 'notes',
        where: { id: { equals: note.id } },
        overrideLock: false,
      });
      expect(many.errors).toEqual([
        expect.objectContaining({ id: note.id, message: expect.stringContaining('locked') }),
      ]);
      expect(await count('locked-delete')).toBe(1);

      await frogbot.delete({ collection: 'notes', id: note.id });
      expect(await count('locked-delete')).toBe(0);
    });
  });

  describe('disableTransaction', () => {
    it('rolls a failed create back by default and keeps the write when disabled', async () => {
      const context = { fail: true };

      await expect(
        frogbot.create({ collection: 'notes', data: { title: 'create-rollback' }, context }),
      ).rejects.toThrow('hook failed after the write');
      expect(await count('create-rollback')).toBe(0);

      await expect(
        frogbot.create({
          collection: 'notes',
          data: { title: 'create-kept' },
          context,
          disableTransaction: true,
        }),
      ).rejects.toThrow('hook failed after the write');
      expect(await count('create-kept')).toBe(1);
    });

    it('keeps a failed update when disabled', async () => {
      const note = await create('update-before');
      const args = { collection: 'notes', id: note.id, context: { fail: true } } as const;

      await expect(frogbot.update({ ...args, data: { title: 'update-rollback' } })).rejects.toThrow(
        'hook failed after the write',
      );
      expect(await count('update-rollback')).toBe(0);

      await expect(
        frogbot.update({ ...args, data: { title: 'update-kept' }, disableTransaction: true }),
      ).rejects.toThrow('hook failed after the write');
      expect(await count('update-kept')).toBe(1);
    });

    it('keeps a failed delete when disabled', async () => {
      const note = await create('delete-target');
      const args = { collection: 'notes', id: note.id, context: { fail: true } } as const;

      await expect(frogbot.delete(args)).rejects.toThrow('hook failed after the write');
      expect(await count('delete-target')).toBe(1);

      await expect(frogbot.delete({ ...args, disableTransaction: true })).rejects.toThrow(
        'hook failed after the write',
      );
      expect(await count('delete-target')).toBe(0);
    });

    it('keeps a failed duplicate when disabled', async () => {
      const note = await create('duplicate-source');
      const args = { collection: 'notes', id: note.id, context: { fail: true } } as const;

      await expect(frogbot.duplicate(args)).rejects.toThrow('hook failed after the write');
      expect(await count('duplicate-source')).toBe(1);

      await expect(frogbot.duplicate({ ...args, disableTransaction: true })).rejects.toThrow(
        'hook failed after the write',
      );
      expect(await count('duplicate-source')).toBe(2);
    });
  });

  describe('create', () => {
    it('duplicateFromID copies the source document', async () => {
      const source = await create('duplicate-from');

      const copy = await frogbot.create({
        collection: 'notes',
        data: {},
        duplicateFromID: source.id,
      });

      expect(copy).toMatchObject({ title: 'duplicate-from' });
      expect(copy.id).not.toBe(source.id);
    });

    it('duplicateFromID copies the file of an upload document', async () => {
      const source = await createAttachment(await writeFixture('copied.txt', 'ribbit'));

      const copy = (await frogbot.create({
        collection: 'attachments',
        data: {},
        duplicateFromID: source.id,
      })) as { filename: string };

      expect(copy.filename).not.toBe(source.filename);
      expect(await readFile(join(filesDir, copy.filename), 'utf8')).toBe('ribbit');
    });

    it('renames a file whose name is already on disk', async () => {
      await writeFile(join(filesDir, 'orphan.txt'), 'left behind');

      const created = await createAttachment(await writeFixture('orphan.txt', 'new'));

      expect(created.filename).toBe('orphan-1.txt');
    });

    it('overwriteExistingFiles replaces a file already on disk instead of renaming', async () => {
      await writeFile(join(filesDir, 'stray.txt'), 'left behind');

      const created = await createAttachment(await writeFixture('stray.txt', 'replaced'), true);

      expect(created.filename).toBe('stray.txt');
      expect(await readFile(join(filesDir, 'stray.txt'), 'utf8')).toBe('replaced');
    });
  });

  describe('update', () => {
    it('filePath replaces the stored file', async () => {
      const attachment = await createAttachment(await writeFixture('before.txt', 'before'));

      const updated = await frogbot.update({
        collection: 'attachments',
        data: {},
        filePath: await writeFixture('after.txt', 'after'),
        id: attachment.id,
      });

      expect(updated.filename).toBe('after.txt');
      expect(await readFile(join(filesDir, 'after.txt'), 'utf8')).toBe('after');
    });

    it('overwriteExistingFiles keeps the file name when the new file has the same name', async () => {
      const attachment = await createAttachment(await writeFixture('same.txt', 'old'));

      const updated = await frogbot.update({
        collection: 'attachments',
        data: {},
        filePath: await writeFixture('same.txt', 'new'),
        id: attachment.id,
        overwriteExistingFiles: true,
      });

      expect(updated.filename).toBe('same.txt');
      expect(await readFile(join(filesDir, 'same.txt'), 'utf8')).toBe('new');
    });

    it('publishAllLocales and unpublishAllLocales set the status of every locale', async () => {
      const article = (await frogbot.create({
        collection: 'articles',
        data: { title: 'Hello' },
        draft: true,
      })) as { id: number | string };
      const status = async () =>
        (
          (await frogbot.findByID({ collection: 'articles', id: article.id, locale: 'all' })) as {
            _status?: unknown;
          }
        )._status;

      await frogbot.update({
        collection: 'articles',
        data: { _status: 'published' },
        id: article.id,
        publishAllLocales: true,
      });
      const published = await status();

      await frogbot.update({
        collection: 'articles',
        data: { _status: 'draft' },
        id: article.id,
        unpublishAllLocales: true,
      });
      const unpublished = await status();

      expect(published).toEqual({ en: 'published', fr: 'published' });
      expect(unpublished).toEqual({ en: 'draft', fr: 'draft' });
    });
  });

  describe('auth', () => {
    it('returns strategy response headers only when canSetHeaders is true', async () => {
      const headers = new Headers({ 'x-editor': 'editor@example.com' });

      const allowed = await frogbot.auth({ canSetHeaders: true, headers });
      const blocked = await frogbot.auth({ headers });

      expect(allowed.user).toMatchObject({ email: 'editor@example.com' });
      expect(allowed.responseHeaders?.get('x-editor-strategy')).toBe('set');
      expect(blocked.responseHeaders).toBeUndefined();
    });
  });
});
