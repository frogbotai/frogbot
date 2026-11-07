import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureAutonumbers } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { brokenSeedError, brokenSeedPath, ownerCredentials } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('projects template seed', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    await ensureAutonumbers(booted.frogbot);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();

    await clearAndSeed(booted.frogbot, 'empty');
  });

  async function signIn(credentials: { email: string; password: string }) {
    return booted.restClient.post<{ token?: string; user?: { id: number | string } }>(
      '/api/users/login',
      credentials,
    );
  }

  async function signUp(credentials: { email: string; password: string }) {
    await booted.frogbot.create({ collection: 'users', data: credentials, overrideAccess: true });

    const { body } = await signIn(credentials);

    return { headers: { Authorization: `JWT ${body.token}` }, id: body.user!.id };
  }

  async function seed(headers?: Record<string, string>, route = '/seed') {
    return booted.restClient.post<{ error?: string; success?: boolean }>(
      `/api${route}`,
      undefined,
      { headers },
    );
  }

  async function counts() {
    const [projects, tasks] = await Promise.all([
      booted.frogbot.count({ collection: 'projects', overrideAccess: true }),
      booted.frogbot.count({ collection: 'tasks', overrideAccess: true }),
    ]);

    return { projects: projects.totalDocs, tasks: tasks.totalDocs };
  }

  it('refuses a signed-out request and changes nothing', async () => {
    const response = await seed();

    expect(response.status).toBe(403);
    expect(await counts()).toEqual({ projects: 0, tasks: 0 });
  });

  it('adds the sample data once, with a key on every task, and refuses a second run', async () => {
    const { headers } = await signUp(ownerCredentials);

    expect((await seed(headers)).body).toEqual({ success: true });
    expect(await counts()).toEqual({ projects: 3, tasks: 12 });

    const again = await seed(headers);

    expect(again.status).toBe(409);
    expect(again.body.error).toBe('This app already has data, so there is nothing to seed.');
    expect(await counts()).toEqual({ projects: 3, tasks: 12 });

    const { docs } = await booted.frogbot.find({
      collection: 'tasks',
      limit: 0,
      depth: 0,
      overrideAccess: true,
    });

    for (const task of docs) expect(task.key).toMatch(/^[A-Z]+-\d+$/);
  });

  it('assigns every task to the signed-in user and makes no other user', async () => {
    const owner = await signUp(ownerCredentials);

    await seed(owner.headers);

    const { docs } = await booted.frogbot.find({
      collection: 'tasks',
      limit: 0,
      depth: 0,
      overrideAccess: true,
    });

    expect(docs.map(({ assignee }) => assignee)).toEqual(docs.map(() => owner.id));

    const users = await booted.frogbot.find({
      collection: 'users',
      depth: 0,
      overrideAccess: true,
    });

    expect(users.docs.map(({ email }) => email)).toEqual([ownerCredentials.email]);
  });

  it("leaves an app's own records alone", async () => {
    const { headers } = await signUp(ownerCredentials);

    await booted.frogbot.create({
      collection: 'projects',
      data: { key: 'OWN', name: 'Our own work', status: 'active' },
      overrideAccess: true,
    });

    expect((await seed(headers)).status).toBe(409);
    expect(await counts()).toEqual({ projects: 1, tasks: 0 });
  });

  it('logs a failing seed and answers 500', async () => {
    const { headers } = await signUp(ownerCredentials);
    const errors = vi.spyOn(booted.frogbot.logger, 'error');

    const response = await seed(headers, brokenSeedPath);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Seeding the database failed.');
    expect(errors).toHaveBeenCalledWith(
      { err: expect.objectContaining({ message: brokenSeedError }) },
      'Seeding the database failed',
    );
  });

  it('seeds in production too', async () => {
    const { headers } = await signUp(ownerCredentials);

    vi.stubEnv('NODE_ENV', 'production');

    expect((await seed(headers)).body).toEqual({ success: true });
    expect(await counts()).toEqual({ projects: 3, tasks: 12 });
  });
});
