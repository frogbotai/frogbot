import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CollectionSlug, FrogBotInstance } from 'frogbot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { importsDir, mediaDir } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Doc = { id: number | string; [key: string]: unknown };

type User = Doc & { collection: 'users'; roles: string[] };

describe('crm template roles', () => {
  let booted: BootedFrogBot;
  let frogbot: FrogBotInstance;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'template-crm-roles');
    frogbot = booted.frogbot;
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(importsDir, { recursive: true, force: true });
    await rm(mediaDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(frogbot, 'empty');
  });

  async function firstRegister(email: string) {
    return booted.restClient.post<{ user?: User }>('/api/users/first-register', {
      email,
      password: 'frogbot-test',
    });
  }

  async function team() {
    const { body } = await firstRegister('admin@example.com');
    const admin = { ...body.user!, collection: 'users' as const };
    const add = async (email: string, roles?: string[]) =>
      ({
        ...(await frogbot.create({
          collection: 'users',
          data: { email, password: 'frogbot-test', ...(roles && { roles }) },
          user: admin,
          overrideAccess: false,
        } as never)),
        collection: 'users',
      }) as unknown as User;

    return {
      admin,
      manager: await add('manager@example.com', ['manager']),
      member: await add('member@example.com'),
      other: await add('other@example.com'),
    };
  }

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

  async function login(email: string) {
    const { body } = await booted.restClient.post<{ token: string }>('/api/users/login', {
      email,
      password: 'frogbot-test',
    });

    return { Authorization: `JWT ${body.token}` };
  }

  function download(email: string, collectionSlug: string) {
    return login(email).then((headers) =>
      booted.restClient.post<unknown>(
        '/api/exports/download',
        { data: { collectionSlug, format: 'csv' } },
        { headers, signal: AbortSignal.timeout(10_000) },
      ),
    );
  }

  function importCSV(user: User, collectionSlug: string, csv: string) {
    const data = Buffer.from(csv);

    return frogbot.create({
      collection: 'imports',
      data: { collectionSlug, importMode: 'create' },
      file: { data, mimetype: 'text/csv', name: `${collectionSlug}.csv`, size: data.length },
      user,
      overrideAccess: false,
    } as never) as unknown as Promise<Doc>;
  }

  it('makes the first user an admin and everyone after a member', async () => {
    const { body, status } = await firstRegister('admin@example.com');

    expect(status).toBe(200);
    expect(body.user?.roles).toEqual(['admin']);

    const added = await as({ ...body.user!, collection: 'users' }).create('users', {
      email: 'new@example.com',
      password: 'frogbot-test',
    });

    expect(added.roles).toEqual(['member']);
  });

  it('lets a member read every record but change only their own, and delete none', async () => {
    const { member, other } = await team();
    const theirs = await as(other).create('companies', { name: 'Globex' });
    const mine = await as(member).create('companies', { name: 'Acme', owner: other.id });

    expect(mine.owner).toMatchObject({ id: member.id });
    expect(await as(member).count('companies')).toBe(2);

    await expect(
      as(member).update('companies', mine.id, { name: 'Acme Inc' }),
    ).resolves.toMatchObject({ name: 'Acme Inc' });
    await expect(as(member).update('companies', theirs.id, { name: 'Mine now' })).rejects.toThrow();
    await expect(as(member).delete('companies', mine.id)).rejects.toThrow();

    const task = await as(member).create('tasks', { title: 'Call Globex', assignee: other.id });

    expect(task.assignee).toMatchObject({ id: member.id });
  });

  it('keeps a member from handing their record to someone else, and lets a manager do it', async () => {
    const { manager, member, other } = await team();
    const deal = await as(member).create('deals', { name: 'Renewal', stage: 'lead' });

    await as(member).update('deals', deal.id, { owner: other.id, stage: 'won' });

    const owner = async () =>
      (await frogbot.findByID({ collection: 'deals', id: deal.id, depth: 0, overrideAccess: true }))
        .owner;

    expect(await owner()).toBe(member.id);

    await as(manager).update('deals', deal.id, { owner: other.id });

    expect(await owner()).toBe(other.id);
  });

  it('lets a member upload media but only a manager change or delete it', async () => {
    const { manager, member } = await team();
    const data = Buffer.from('logo');
    const media = (await frogbot.create({
      collection: 'media',
      data: { alt: 'Logo' },
      file: { data, mimetype: 'text/plain', name: 'logo.txt', size: data.length },
      user: member,
      overrideAccess: false,
    })) as unknown as Doc;

    await expect(as(member).update('media', media.id, { alt: 'Mine' })).rejects.toThrow();
    await expect(as(member).delete('media', media.id)).rejects.toThrow();
    await expect(as(manager).update('media', media.id, { alt: 'Brand' })).resolves.toMatchObject({
      alt: 'Brand',
    });
    await expect(as(manager).delete('media', media.id)).resolves.toMatchObject({ id: media.id });
  });

  it('lets a manager change and delete anyone’s records but not manage users', async () => {
    const { manager, member } = await team();
    const deal = await as(member).create('deals', { name: 'Renewal', stage: 'lead' });

    await expect(as(manager).update('deals', deal.id, { stage: 'won' })).resolves.toMatchObject({
      stage: 'won',
    });
    await expect(as(manager).delete('deals', deal.id)).resolves.toMatchObject({ id: deal.id });
    await expect(
      as(manager).create('users', { email: 'x@example.com', password: 'frogbot-test' }),
    ).rejects.toThrow();
    await expect(as(manager).delete('users', member.id)).rejects.toThrow();
  });

  it('lets only an admin change roles, and users edit only their own profile', async () => {
    const { admin, manager, member, other } = await team();

    const promoted = await as(member).update('users', member.id, {
      name: 'Mo',
      roles: ['admin'],
    });

    expect(promoted).toMatchObject({ name: 'Mo', roles: ['member'] });
    await expect(as(manager).update('users', member.id, { name: 'Renamed' })).rejects.toThrow();
    await expect(as(member).update('users', other.id, { name: 'Renamed' })).rejects.toThrow();
    await expect(
      as(admin).update('users', member.id, { roles: ['manager'] }),
    ).resolves.toMatchObject({ roles: ['manager'] });
  });

  it('records each change in an audit log that admins and managers read and members do not', async () => {
    const { admin, manager, member } = await team();
    const contact = await as(member).create('contacts', { name: 'Ada Lovelace' });

    await as(member).update('contacts', contact.id, { jobTitle: 'Engineer' });

    const { docs } = await frogbot.find({
      collection: 'audit-logs',
      where: { collection: { equals: 'contacts' } },
      sort: 'timestamp',
      overrideAccess: true,
    } as never);

    expect(docs.map((entry) => (entry as unknown as Doc).operation)).toEqual(['create', 'update']);
    expect(await as(admin).count('audit-logs')).toBeGreaterThan(0);
    expect(await as(manager).count('audit-logs')).toBeGreaterThan(0);
    await expect(as(member).count('audit-logs')).rejects.toThrow();
  });

  it('imports a CSV as the importing user, so a member’s rows are theirs', async () => {
    const { member } = await team();
    const created = await importCSV(
      member,
      'companies',
      'name,website\nInitech,https://initech.example\nHooli,\n',
    );

    expect(created.status).toBe('completed');

    const { docs } = await frogbot.find({
      collection: 'companies',
      sort: 'name',
      depth: 0,
      overrideAccess: true,
    });

    expect(docs.map(({ name, owner }) => ({ name, owner }))).toEqual([
      { name: 'Hooli', owner: member.id },
      { name: 'Initech', owner: member.id },
    ]);
  });

  it('lets a manager export records, saved or downloaded', async () => {
    const { manager } = await team();

    await as(manager).create('companies', { name: 'Globex' });

    await expect(
      as(manager).create('exports', { collectionSlug: 'companies', format: 'csv' }),
    ).resolves.toMatchObject({ collectionSlug: 'companies' });

    const { body, status } = await download('manager@example.com', 'companies');

    expect(status).toBe(200);
    expect(String(body)).toContain('Globex');
  });

  it('refuses a member’s download of the audit log instead of hanging', async () => {
    const { member } = await team();

    await as(member).create('contacts', { name: 'Ada Lovelace' });

    const { body, status } = await download('member@example.com', 'audit-logs');

    expect(status).toBe(400);
    expect(JSON.stringify(body)).not.toContain('Ada Lovelace');
  });

  it('lets only admins and managers delete imports and exports', async () => {
    const { manager, member, other } = await team();
    const theirs = await importCSV(other, 'companies', 'name\nInitech\n');
    const exported = await as(manager).create('exports', {
      collectionSlug: 'companies',
      format: 'csv',
    });

    await expect(as(member).delete('imports', theirs.id)).rejects.toThrow();
    await expect(as(member).delete('exports', exported.id)).rejects.toThrow();
    await expect(as(manager).delete('imports', theirs.id)).resolves.toMatchObject({
      id: theirs.id,
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
