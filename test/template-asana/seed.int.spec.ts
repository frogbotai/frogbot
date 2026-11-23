import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureAutonumbers } from 'frogbot/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { brokenSeedError, brokenSeedPath, ownerCredentials } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const empty = { projects: 0, tasks: 0, files: 0, comments: 0 };
const full = { projects: 3, tasks: 14, files: 1, comments: 2 };

describe('asana template seed', () => {
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
    const [projects, tasks, files, comments] = await Promise.all(
      (['projects', 'tasks', 'files', 'comments'] as const).map((collection) =>
        booted.frogbot.count({ collection, overrideAccess: true }),
      ),
    );

    return {
      projects: projects.totalDocs,
      tasks: tasks.totalDocs,
      files: files.totalDocs,
      comments: comments.totalDocs,
    };
  }

  it('refuses a signed-out request and changes nothing', async () => {
    const response = await seed();

    expect(response.status).toBe(403);
    expect(await counts()).toEqual(empty);
  });

  it('adds the sample data once, every task assigned to the caller and keyed', async () => {
    const { headers, id } = await signUp(ownerCredentials);

    expect((await seed(headers)).body).toEqual({ success: true });
    expect(await counts()).toEqual(full);

    const { docs } = await booted.frogbot.find({
      collection: 'tasks',
      limit: 0,
      depth: 0,
      overrideAccess: true,
    });

    for (const task of docs) {
      expect(task.key).toMatch(/^[A-Z]+-\d+$/);
      expect(task.assignee).toBe(id);
    }

    const spans = docs.filter((task) => task.startDate && task.dueDate);

    expect(spans).toHaveLength(10);
    expect(docs.filter((task) => task.status === 'done').every((task) => task.completed)).toBe(
      true,
    );

    for (const task of spans) {
      expect(Date.parse(task.startDate!)).toBeLessThan(Date.parse(task.dueDate!));
    }
  });

  it('gives one task subtasks in its project, an attachment and two comments', async () => {
    const { headers, id } = await signUp(ownerCredentials);

    await seed(headers);

    const { docs } = await booted.frogbot.find({
      collection: 'tasks',
      where: { title: { equals: 'Design the pricing page' } },
      depth: 1,
      overrideAccess: true,
    });

    const [task] = docs;
    const subtasks = await booted.frogbot.find({
      collection: 'tasks',
      where: { parent: { equals: task.id } },
      sort: 'createdAt',
      depth: 0,
      overrideAccess: true,
    });

    const comments = await booted.frogbot.find({
      collection: 'comments',
      where: { documentId: { equals: String(task.id) } },
      depth: 0,
      overrideAccess: true,
    });

    expect(
      subtasks.docs.map(({ completed, project, status, title }) => ({
        completed,
        project,
        status,
        title,
      })),
    ).toEqual([
      {
        completed: true,
        project: (task.project as { id: number | string }).id,
        status: 'done',
        title: 'Sketch the plan comparison table',
      },
      {
        completed: false,
        project: (task.project as { id: number | string }).id,
        status: 'todo',
        title: 'Write the pricing FAQ',
      },
    ]);
    expect(task.attachments).toEqual([expect.objectContaining({ filename: 'pricing-notes.txt' })]);
    expect(comments.docs).toHaveLength(2);
    expect(comments.docs.every((comment) => comment.author === id)).toBe(true);
  });

  it('refuses a second seed with 409 and changes nothing', async () => {
    const { headers } = await signUp(ownerCredentials);

    await seed(headers);
    const first = await counts();
    const response = await seed(headers);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(
      'This app already has projects, so the sample data was not added.',
    );
    expect(await counts()).toEqual(first);
  });

  it('creates no user: the signed-in person is the only one', async () => {
    const { headers } = await signUp(ownerCredentials);

    await seed(headers);

    const { docs } = await booted.frogbot.find({
      collection: 'users',
      depth: 0,
      overrideAccess: true,
    });

    expect(docs.map(({ email }) => email)).toEqual([ownerCredentials.email]);
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

  it('undoes a seed that fails midway, so a retry adds the full sample data', async () => {
    const { headers } = await signUp(ownerCredentials);
    const create = booted.frogbot.create.bind(booted.frogbot);
    let taskCreates = 0;

    vi.spyOn(booted.frogbot, 'create').mockImplementation((args) => {
      if (args.collection === 'tasks' && ++taskCreates === 3) {
        return Promise.reject(new Error('connection lost mid-seed'));
      }

      return create(args);
    });

    expect((await seed(headers)).status).toBe(500);
    expect(await counts()).toEqual(empty);

    vi.restoreAllMocks();

    expect((await seed(headers)).status).toBe(200);
    expect(await counts()).toEqual(full);
  });

  it('undoes a seed that fails after the comments are added', async () => {
    const { headers } = await signUp(ownerCredentials);
    const create = booted.frogbot.create.bind(booted.frogbot);
    let taskCreates = 0;

    vi.spyOn(booted.frogbot, 'create').mockImplementation((args) => {
      if (args.collection === 'tasks' && ++taskCreates === 6) {
        return Promise.reject(new Error('connection lost after comments'));
      }

      return create(args);
    });

    expect((await seed(headers)).status).toBe(500);
    expect(await counts()).toEqual(empty);
  });

  it('seeds in production too, and refuses a second seed there', async () => {
    const { headers } = await signUp(ownerCredentials);

    vi.stubEnv('NODE_ENV', 'production');

    expect((await seed(headers)).body).toEqual({ success: true });
    expect(await counts()).toEqual(full);
    expect((await seed(headers)).status).toBe(409);
  });
});
