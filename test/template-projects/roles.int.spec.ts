import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CollectionSlug, FrogBotInstance } from 'frogbot';
import { ensureAutonumbers } from 'frogbot/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Doc = { id: number | string; [key: string]: unknown };

type User = Doc & { collection: 'users'; roles: string[] };

describe('projects template roles', () => {
  let booted: BootedFrogBot;
  let frogbot: FrogBotInstance;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'template-projects-roles');
    frogbot = booted.frogbot;
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(frogbot, 'empty');
    await ensureAutonumbers(frogbot);
  });

  function as(user: User) {
    const options = { user, overrideAccess: false };

    return {
      create: (collection: CollectionSlug, data: Record<string, unknown>) =>
        frogbot.create({ collection, data, ...options }) as Promise<Doc>,
      update: (collection: CollectionSlug, id: Doc['id'], data: Record<string, unknown>) =>
        frogbot.update({ collection, id, data, ...options } as never) as Promise<Doc>,
      delete: (collection: CollectionSlug, id: Doc['id']) =>
        frogbot.delete({ collection, id, ...options } as never) as Promise<Doc>,
      count: async (collection: CollectionSlug) =>
        (await frogbot.count({ collection, ...options })).totalDocs,
    };
  }

  async function team() {
    const { body, status } = await booted.restClient.post<{ user?: User }>(
      '/api/users/first-register',
      { email: 'admin@example.com', password: 'frogbot-test' },
    );

    expect(status).toBe(200);

    const admin = { ...body.user!, collection: 'users' as const };
    const add = async (email: string, roles?: string[]) =>
      ({
        ...(await as(admin).create('users', {
          email,
          password: 'frogbot-test',
          ...(roles && { roles }),
        })),
        collection: 'users',
      }) as User;

    return {
      admin,
      manager: await add('manager@example.com', ['manager']),
      member: await add('member@example.com'),
      other: await add('other@example.com'),
    };
  }

  it('makes the first user an admin and the users they add members', async () => {
    const { admin, member } = await team();

    expect(admin.roles).toEqual(['admin']);
    expect(member.roles).toEqual(['member']);
  });

  it('lets managers run projects and members only read them', async () => {
    const { manager, member } = await team();
    const project = await as(manager).create('projects', { name: 'Website', key: 'WEB' });

    expect(await as(member).count('projects')).toBe(1);
    await expect(as(member).create('projects', { name: 'App', key: 'APP' })).rejects.toThrow();
    await expect(as(member).update('projects', project.id, { name: 'Site' })).rejects.toThrow();
    await expect(as(manager).delete('projects', project.id)).resolves.toMatchObject({
      id: project.id,
    });
  });

  it('assigns a member’s new task to them and lets them change only their own tasks', async () => {
    const { manager, member, other } = await team();
    const project = await as(manager).create('projects', { name: 'Website', key: 'WEB' });
    const mine = await as(member).create('tasks', {
      title: 'Write copy',
      project: project.id,
      assignee: other.id,
    });

    const theirs = await as(other).create('tasks', { title: 'Design', project: project.id });

    expect(mine.assignee).toMatchObject({ id: member.id });
    await expect(as(member).update('tasks', mine.id, { status: 'done' })).resolves.toMatchObject({
      status: 'done',
    });
    await expect(as(member).update('tasks', theirs.id, { status: 'done' })).rejects.toThrow();
    await expect(as(member).delete('tasks', mine.id)).rejects.toThrow();
    await expect(as(manager).update('tasks', theirs.id, { status: 'done' })).resolves.toMatchObject(
      { status: 'done' },
    );
  });

  it('keeps roles and other people’s profiles out of a member’s reach', async () => {
    const { member, other } = await team();

    await expect(
      as(member).update('users', member.id, { roles: ['admin'] }),
    ).resolves.toMatchObject({ roles: ['member'] });
    await expect(as(member).update('users', other.id, { name: 'Renamed' })).rejects.toThrow();
    await expect(as(member).count('audit-logs')).rejects.toThrow();
  });
});
