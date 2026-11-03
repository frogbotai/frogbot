import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureAutonumbers } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO_EMAIL, DEMO_PASSWORD } from '../../templates/projects/src/seed/index.js';
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

  it('replaces the sample data when run twice, and every task has a key', async () => {
    const { headers } = await signUp(ownerCredentials);

    expect((await seed(headers)).body).toEqual({ success: true });

    const first = await counts();

    expect((await seed(headers)).body).toEqual({ success: true });
    expect(first).toEqual({ projects: 3, tasks: 12 });
    expect(await counts()).toEqual(first);

    const { docs } = await booted.frogbot.find({
      collection: 'tasks',
      limit: 0,
      depth: 0,
      overrideAccess: true,
    });

    for (const task of docs) expect(task.key).toMatch(/^[A-Z]+-\d+$/);
  });

  it('creates a demo user that can sign in, without touching the signed-in user', async () => {
    const owner = await signUp(ownerCredentials);

    await seed(owner.headers);
    await seed(owner.headers);

    const demo = await signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const ownerAgain = await signIn(ownerCredentials);

    expect(demo.status).toBe(200);
    expect(ownerAgain.body.user?.id).toBe(owner.id);

    const { totalDocs } = await booted.frogbot.count({
      collection: 'users',
      where: { email: { equals: DEMO_EMAIL } },
      overrideAccess: true,
    });

    expect(totalDocs).toBe(1);
  });

  it('keeps the demo user as is when it is the signed-in user', async () => {
    const own = { email: DEMO_EMAIL, password: 'my-own-password' };
    const { headers, id } = await signUp(own);

    expect((await seed(headers)).status).toBe(200);

    const again = await signIn(own);

    expect(again.status).toBe(200);
    expect(again.body.user?.id).toBe(id);
    expect((await signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD })).status).toBe(401);
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
