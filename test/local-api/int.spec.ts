import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { FrogBot, getFrogBotPayload } from '../../packages/frogbot/src/frogbot.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const failAfterWrite = ({ context }: { context: Record<string, unknown> }) => {
  if (context.fail) throw new Error('hook failed after the write');
};

describe(`local API write options [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let payload: Payload;
  let databaseDir: string;
  let editorID: number | string;

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
      collections: [
        { slug: 'editors', auth: true, fields: [] },
        {
          slug: 'notes',
          hooks: { afterChange: [failAfterWrite], afterDelete: [failAfterWrite] },
          fields: [{ name: 'title', type: 'text' }],
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
});
