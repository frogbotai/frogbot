import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CollectionSlug, FrogBotInstance } from 'frogbot';
import { ensureAutonumbers } from 'frogbot/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { filesDir, importsDir } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Doc = { id: number | string; [key: string]: unknown };

type User = Doc & { collection: 'users'; roles: string[]; name?: string | null };

describe('asana template roles', () => {
  let booted: BootedFrogBot;
  let frogbot: FrogBotInstance;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'template-asana-roles');
    frogbot = booted.frogbot;
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(filesDir, { recursive: true, force: true });
    await rm(importsDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(frogbot, 'empty');
    await ensureAutonumbers(frogbot);
  });

  function as(user: User) {
    const options = { user, overrideAccess: false };

    return {
      create: (collection: CollectionSlug, data: Record<string, unknown>) =>
        (frogbot.create as (args: object) => Promise<Doc>)({ collection, data, ...options }),
      update: (collection: CollectionSlug, id: Doc['id'], data: Record<string, unknown>) =>
        (frogbot.update as (args: object) => Promise<Doc>)({ collection, id, data, ...options }),
      delete: (collection: CollectionSlug, id: Doc['id']) =>
        (frogbot.delete as (args: object) => Promise<Doc>)({ collection, id, ...options }),
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

  it('names a user with no name after their email, until a name is set', async () => {
    const { admin, member } = await team();

    expect(admin.name).toBe('admin@example.com');
    expect(member.name).toBe('member@example.com');

    const named = await as(admin).update('users', member.id, { name: 'Mia Park' });

    expect(named.name).toBe('Mia Park');

    const cleared = await as(admin).update('users', member.id, { name: '' });

    expect(cleared.name).toBe('member@example.com');

    const moved = await as(admin).update('users', member.id, { email: 'mia@example.com' });

    expect(moved).toMatchObject({ email: 'mia@example.com', name: 'mia@example.com' });

    await as(admin).update('users', member.id, { name: 'Mia Park' });

    const kept = await as(admin).update('users', member.id, { email: 'park@example.com' });

    expect(kept.name).toBe('Mia Park');
  });

  it('names a user after their email as stored, trimmed and lowercased', async () => {
    const { admin } = await team();
    const mia = await as(admin).create('users', {
      email: ' Mia.Park@Example.com ',
      password: 'frogbot-test',
      roles: ['member'],
    });

    expect(mia).toMatchObject({ email: 'mia.park@example.com', name: 'mia.park@example.com' });

    const moved = await as(admin).update('users', mia.id, { email: 'Mia@Example.com' });

    expect(moved).toMatchObject({ email: 'mia@example.com', name: 'mia@example.com' });
  });

  it('shows a user saved before names were filled in by their email', async () => {
    const { admin, member } = await team();

    await frogbot.db.updateOne({ collection: 'users', data: { name: null }, id: member.id });

    const found = await frogbot.findByID({
      collection: 'users',
      id: member.id,
      overrideAccess: false,
      select: { name: true },
      user: admin,
    });

    expect(found.name).toBe('member@example.com');
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

  it('gives a member’s subtask its parent’s project and refuses a parent in another project', async () => {
    const { manager, member } = await team();
    const web = await as(manager).create('projects', { name: 'Website', key: 'WEB' });
    const app = await as(manager).create('projects', { name: 'App', key: 'APP' });
    const parent = await as(member).create('tasks', { title: 'Pricing page', project: web.id });
    const subtask = await as(member).create('tasks', { title: 'FAQ', parent: parent.id });

    expect(subtask.project).toMatchObject({ id: web.id });
    expect(subtask.key).toMatch(/^WEB-\d+$/);
    await expect(
      as(member).update('tasks', subtask.id, { completed: true }),
    ).resolves.toMatchObject({ completed: true, status: 'todo' });

    const elsewhere = await as(member).create('tasks', { title: 'Store listing', project: app.id });

    await expect(
      as(member).update('tasks', elsewhere.id, { parent: elsewhere.id }),
    ).rejects.toThrow();
    await expect(as(member).update('tasks', parent.id, { parent: subtask.id })).rejects.toThrow(
      "A task can't be a subtask of itself or of its own subtask.",
    );
  });

  it('gives a subtask its parent’s project and refuses a cycle with no user too', async () => {
    const system = { overrideAccess: true } as const;
    const project = await frogbot.create({
      collection: 'projects',
      data: { name: 'Website', key: 'WEB' },
      ...system,
    });

    const parent = await frogbot.create({
      collection: 'tasks',
      data: { title: 'Pricing page', project: project.id },
      ...system,
    });

    const subtask = await frogbot.create({
      collection: 'tasks',
      data: { title: 'FAQ', parent: parent.id },
      depth: 0,
      ...system,
    });

    expect(subtask.project).toBe(project.id);
    await expect(
      frogbot.update({
        collection: 'tasks',
        id: parent.id,
        data: { parent: subtask.id },
        ...system,
      }),
    ).rejects.toThrow("A task can't be a subtask of itself or of its own subtask.");
  });

  it('keeps a member from reassigning their task, and lets a manager do it', async () => {
    const { manager, member, other } = await team();
    const project = await as(manager).create('projects', { name: 'Website', key: 'WEB' });
    const task = await as(member).create('tasks', { title: 'Write copy', project: project.id });
    const assignee = async () =>
      (await frogbot.findByID({ collection: 'tasks', id: task.id, depth: 0, overrideAccess: true }))
        .assignee;

    await as(member).update('tasks', task.id, { assignee: other.id });

    expect(await assignee()).toBe(member.id);

    await as(manager).update('tasks', task.id, { assignee: other.id });

    expect(await assignee()).toBe(other.id);
  });

  it('lets a member upload files but only a manager change or delete them', async () => {
    const { manager, member } = await team();
    const data = Buffer.from('brief');
    const file = (await frogbot.create({
      collection: 'files',
      data: {},
      file: { data, mimetype: 'text/plain', name: 'brief.txt', size: data.length },
      user: member,
      overrideAccess: false,
    })) as unknown as Doc;

    await expect(as(member).update('files', file.id, {})).rejects.toThrow();
    await expect(as(member).delete('files', file.id)).rejects.toThrow();
    await expect(as(manager).delete('files', file.id)).resolves.toMatchObject({ id: file.id });
  });

  it('keeps roles and other people’s profiles out of a member’s reach', async () => {
    const { member, other } = await team();

    await expect(
      as(member).update('users', member.id, { roles: ['admin'] }),
    ).resolves.toMatchObject({ roles: ['member'] });
    await expect(as(member).update('users', other.id, { name: 'Renamed' })).rejects.toThrow();
    await expect(as(member).count('audit-logs')).rejects.toThrow();
  });

  it('lets a manager export projects, saved or downloaded', async () => {
    const { manager } = await team();

    await as(manager).create('projects', { name: 'Website', key: 'WEB' });

    await expect(
      as(manager).create('exports', { collectionSlug: 'projects', format: 'csv' }),
    ).resolves.toMatchObject({ collectionSlug: 'projects' });

    const { body: login } = await booted.restClient.post<{ token: string }>('/api/users/login', {
      email: 'manager@example.com',
      password: 'frogbot-test',
    });

    const { body, status } = await booted.restClient.post<unknown>(
      '/api/exports/download',
      { data: { collectionSlug: 'projects', format: 'csv' } },
      { headers: { Authorization: `JWT ${login.token}` }, signal: AbortSignal.timeout(10_000) },
    );

    expect(status).toBe(200);
    expect(String(body)).toContain('Website');
  });

  it('lets only admins and managers delete imports and exports', async () => {
    const { manager, member } = await team();
    const data = Buffer.from('name,key\nWebsite,WEB\n');
    const imported = (await frogbot.create({
      collection: 'imports',
      data: { collectionSlug: 'projects', importMode: 'create' },
      file: { data, mimetype: 'text/csv', name: 'projects.csv', size: data.length },
      user: manager,
      overrideAccess: false,
    } as never)) as unknown as Doc;

    const exported = await as(manager).create('exports', {
      collectionSlug: 'projects',
      format: 'csv',
    });

    await expect(as(member).delete('imports', imported.id)).rejects.toThrow();
    await expect(as(member).delete('exports', exported.id)).rejects.toThrow();
    await expect(as(manager).delete('imports', imported.id)).resolves.toMatchObject({
      id: imported.id,
    });
    await expect(as(manager).delete('exports', exported.id)).resolves.toMatchObject({
      id: exported.id,
    });
  });

  it('lets only an admin set a user’s AI budget and models', async () => {
    const { admin, member } = await team();
    const limits = { monthlyBudget: 5, models: ['openai/gpt-5.4-mini'] };

    await as(admin).update('users', member.id, limits);
    await as(member).update('users', member.id, { monthlyBudget: 100000, models: [] });

    const after = await frogbot.findByID({
      collection: 'users',
      id: member.id,
      depth: 0,
      overrideAccess: true,
    });

    expect({ monthlyBudget: after.monthlyBudget, models: after.models }).toEqual(limits);
  });
});
