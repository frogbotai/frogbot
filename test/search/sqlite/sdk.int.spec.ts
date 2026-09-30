import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createFrogBotSDK, type FrogBotSDK } from '../../../packages/sdk/src/index.js';
import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { articlesSlug, databasePath } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('SQLite search through the FrogBot SDK', () => {
  let booted: BootedFrogBot;
  let sdk: FrogBotSDK;

  const create = (data: Record<string, unknown>) =>
    booted.frogbot.create({
      collection: articlesSlug,
      data: { _status: 'published', ...data },
      overrideAccess: true,
    } as never) as Promise<{ id: number }>;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'search-sqlite-sdk');
    sdk = createFrogBotSDK({ baseURL: `${booted.baseUrl}/api` });
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(databasePath, { force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('search returns the mode, ranking, and ranked hits with their documents', async () => {
    const strong = await create({
      title: 'Account recovery',
      body: 'Recover your account with account recovery codes.',
    });

    const weak = await create({
      title: 'Billing',
      body: 'Account billing and account recovery for invoices, receipts, refunds and payment methods.',
    });

    await create({ title: 'Unrelated', body: 'Nothing to see.' });

    const result = await sdk.search(articlesSlug, {
      index: 'content',
      query: { text: 'account recovery' },
    });

    expect(result.mode).toBe('lexical');
    expect(result.ranking).toEqual({
      approximate: false,
      higherIsBetter: true,
      method: 'sqlite-fts5',
    });
    expect(result.hits.map(({ doc }) => doc.id)).toEqual([strong.id, weak.id]);
    expect(result.hits[0]!.doc).toMatchObject({ title: 'Account recovery' });
    expect(result.hits[0]!.score).toBeGreaterThan(result.hits[1]!.score);
  });

  it('search applies where, limit, and select', async () => {
    await create({ title: 'Frog ponds', body: 'Frogs live in ponds.', rating: 5 });
    await create({ title: 'Frog legs', body: 'Frogs have strong legs.', rating: 1 });

    const result = await sdk.search(articlesSlug, {
      index: 'content',
      limit: 1,
      query: { text: 'frogs' },
      select: { title: true },
      where: { rating: { greater_than: 3 } },
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]!.doc).toEqual({ id: expect.any(Number), title: 'Frog ponds' });
  });
});
