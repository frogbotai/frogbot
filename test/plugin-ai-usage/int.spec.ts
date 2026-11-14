import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { UsageReport } from '@frogbotai/plugin-ai-usage';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import type { ApiKey, UsageLog, User } from './frogbot-types.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';
const password = 'frogbot-test-password';
const range = 'from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z';

type Usage = Partial<Omit<UsageLog, 'id' | 'createdAt' | 'updatedAt'>> &
  Pick<UsageLog, 'model' | 'requestedAt'>;

describe(`usage reports [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;
  let admin: User;
  let member: User;
  let key: ApiKey;
  let run = 0;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  afterEach(() => vi.restoreAllMocks());

  async function createUsage(data: Usage, index: number): Promise<void> {
    await booted.frogbot.create({
      collection: 'usage-logs',
      data: {
        requestId: `request-${index}`,
        operation: 'chat.completions',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUSD: 0,
        ...data,
      },
      overrideAccess: true,
    });
  }

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    run += 1;

    admin = await booted.frogbot.create({
      collection: 'users',
      data: { email: `admin-${run}@frogbot.local`, password, name: 'Ada', role: 'admin' },
      overrideAccess: true,
    });

    member = await booted.frogbot.create({
      collection: 'users',
      data: { email: `member-${run}@frogbot.local`, password, name: 'Max', role: 'member' },
      overrideAccess: true,
    });

    key = await booted.frogbot.create({
      collection: 'api-keys',
      data: { name: 'Production', owner: admin.id, prefix: 'prod', tokenHash: `hash-${run}` },
      overrideAccess: true,
    });

    const rows: Usage[] = [
      {
        user: admin.id,
        apiKey: key.id,
        model: 'openai/a',
        requestedAt: '2026-01-02T23:30:00.000Z',
        inputTokens: 10,
        outputTokens: 5,
        cachedInputTokens: 2,
        reasoningTokens: 1,
        totalTokens: 18,
        costUSD: 0.5,
      },
      {
        user: admin.id,
        apiKey: key.id,
        model: 'openai/a',
        requestedAt: '2026-01-02T01:00:00.000Z',
        inputTokens: 2,
        outputTokens: 1,
        totalTokens: 3,
        costUSD: 0.25,
      },
      {
        user: member.id,
        model: 'openai/b',
        requestedAt: '2026-01-03T12:00:00.000Z',
        inputTokens: 3,
        outputTokens: 4,
        cacheWriteTokens: 4,
        totalTokens: 7,
        costUSD: 0.125,
      },
      {
        model: 'openai/b',
        requestedAt: '2026-01-03T18:00:00.000Z',
        totalTokens: 1,
        costUSD: 0.0625,
      },
      {
        user: admin.id,
        model: 'openai/a',
        requestedAt: '2026-03-01T00:00:00.000Z',
        totalTokens: 100,
        costUSD: 4,
      },
    ];

    for (const [index, row] of rows.entries()) await createUsage(row, index);
  });

  async function report(groupBy: string, user: User = admin) {
    const login = await booted.restClient.post<{ token: string }>('/api/users/login', {
      email: user.email,
      password,
    });

    return booted.restClient.get<UsageReport>(`/api/usage/report?groupBy=${groupBy}&${range}`, {
      headers: { authorization: `JWT ${login.body.token}` },
    });
  }

  const modelA = {
    requestCount: 2,
    inputTokens: 12,
    outputTokens: 6,
    cachedInputTokens: 2,
    cacheWriteTokens: 0,
    reasoningTokens: 1,
    totalTokens: 21,
    costUSD: 0.75,
  };

  it('totals each model in the range', async () => {
    const { status, body } = await report('model');

    expect(status).toBe(200);
    expect(body).toEqual({
      groupBy: 'model',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      rows: [
        { key: 'openai/a', label: 'openai/a', ...modelA },
        {
          key: 'openai/b',
          label: 'openai/b',
          requestCount: 2,
          inputTokens: 3,
          outputTokens: 4,
          cachedInputTokens: 0,
          cacheWriteTokens: 4,
          reasoningTokens: 0,
          totalTokens: 8,
          costUSD: 0.1875,
        },
      ],
      totals: {
        requestCount: 4,
        inputTokens: 15,
        outputTokens: 10,
        cachedInputTokens: 2,
        cacheWriteTokens: 4,
        reasoningTokens: 1,
        totalTokens: 29,
        costUSD: 0.9375,
      },
    });
  });

  it('totals each UTC day', async () => {
    const { body } = await report('day');

    expect(body.rows).toEqual([
      { key: '2026-01-02', label: '2026-01-02', ...modelA },
      expect.objectContaining({ key: '2026-01-03', requestCount: 2, totalTokens: 8 }),
    ]);
  });

  it('labels users by name and leaves out rows with no user', async () => {
    const { body } = await report('user');

    expect(body.rows).toEqual([
      { key: String(admin.id), label: 'Ada', ...modelA },
      expect.objectContaining({
        key: String(member.id),
        label: 'Max',
        requestCount: 1,
        costUSD: 0.125,
      }),
    ]);
    expect(body.totals).toMatchObject({ requestCount: 3, totalTokens: 28 });
  });

  it('labels API keys by name', async () => {
    const { body } = await report('apiKey');

    expect(body.rows).toEqual([{ key: String(key.id), label: 'Production', ...modelA }]);
  });

  it('narrows the totals to the rows the access scope allows', async () => {
    const { status, body } = await report('model', member);

    expect(status).toBe(200);
    expect(body.rows).toEqual([
      expect.objectContaining({ key: 'openai/b', requestCount: 1, totalTokens: 7, costUSD: 0.125 }),
    ]);
  });

  it('refuses an anonymous caller', async () => {
    const response = await booted.restClient.get(`/api/usage/report?groupBy=model&${range}`);

    expect(response.status).toBe(401);
  });

  it('prunes usage older than the retention window', async () => {
    const expired = new Date(Date.now() - 31 * 86_400_000).toISOString();

    for (let index = 0; index < 250; index++) {
      await createUsage({ model: 'openai/old', requestedAt: expired }, 1000 + index);
    }

    await createUsage({ model: 'openai/new', requestedAt: new Date().toISOString() }, 2000);

    const job = await booted.frogbot.jobs.queue({
      task: 'frogbot-prune-usage-logs',
      input: {},
      overrideAccess: true,
    });

    await booted.frogbot.jobs.runByID({ id: job.id, overrideAccess: true });

    const remaining = await booted.frogbot.find({
      collection: 'usage-logs',
      limit: 0,
      overrideAccess: true,
    });

    expect(remaining.docs.map((doc) => doc.model)).toEqual(['openai/new']);
  });

  it('keeps usage at the cutoff and leaves other collections alone', async () => {
    const now = Date.now();
    const cutoff = now - 30 * 86_400_000;

    const rows = [
      { model: 'openai/before', at: cutoff - 1 },
      { model: 'openai/at', at: cutoff },
      { model: 'openai/after', at: cutoff + 1 },
    ];

    for (const [index, { model, at }] of rows.entries()) {
      await createUsage({ model, requestedAt: new Date(at).toISOString() }, 3000 + index);
    }

    const job = await booted.frogbot.jobs.queue({
      task: 'frogbot-prune-usage-logs',
      input: {},
      overrideAccess: true,
    });

    vi.spyOn(Date, 'now').mockReturnValue(now);
    await booted.frogbot.jobs.runByID({ id: job.id, overrideAccess: true });

    const remaining = await booted.frogbot.find({
      collection: 'usage-logs',
      limit: 0,
      sort: 'requestedAt',
      overrideAccess: true,
    });

    expect(remaining.docs.map((doc) => doc.model)).toEqual(['openai/at', 'openai/after']);

    const users = await booted.frogbot.count({ collection: 'users', overrideAccess: true });
    const keys = await booted.frogbot.count({ collection: 'api-keys', overrideAccess: true });

    expect(users.totalDocs).toBe(2);
    expect(keys.totalDocs).toBe(1);
  });
});
