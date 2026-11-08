import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SAMPLE_COLLECTIONS, seed } from '../../templates/crm/src/seed/index.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { brokenSeedError, brokenSeedPath, mediaDir, ownerCredentials } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const today = new Date('2026-06-15T12:00:00Z');

describe('crm template seed', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
    rmSync(mediaDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();

    await clearAndSeed(booted.frogbot, 'empty');
  });

  async function signUp() {
    const user = await booted.frogbot.create({
      collection: 'users',
      data: ownerCredentials,
      overrideAccess: true,
    });

    const { body } = await booted.restClient.post<{ token?: string }>(
      '/api/users/login',
      ownerCredentials,
    );

    return { headers: { Authorization: `JWT ${body.token}` }, id: user.id };
  }

  async function post(headers?: Record<string, string>, route = '/seed') {
    return booted.restClient.post<{ error?: string; success?: boolean }>(
      `/api${route}`,
      undefined,
      { headers },
    );
  }

  async function counts() {
    const entries = await Promise.all(
      [...SAMPLE_COLLECTIONS, 'media' as const, 'users' as const].map(async (collection) => {
        const { totalDocs } = await booted.frogbot.count({ collection, overrideAccess: true });

        return [collection, totalDocs] as const;
      }),
    );

    return Object.fromEntries(entries);
  }

  it('adds 24 to 40 curated records with a logo for every company, and no QA edge case', async () => {
    const { id } = await signUp();

    await seed({ frogbot: booted.frogbot, today });

    const { media, users, ...sample } = await counts();
    const total = Object.values(sample).reduce((sum, count) => sum + count, 0);

    expect(total).toBeGreaterThanOrEqual(24);
    expect(total).toBeLessThanOrEqual(40);
    expect(users).toBe(1);
    expect(media).toBe(sample.companies);

    for (const collection of SAMPLE_COLLECTIONS) expect(sample[collection]).toBeGreaterThan(0);

    const companies = await booted.frogbot.find({
      collection: 'companies',
      depth: 1,
      limit: 0,
      overrideAccess: true,
    });

    for (const company of companies.docs) {
      expect(company.logo).toMatchObject({ mimeType: 'image/webp' });
      expect(company.owner).toMatchObject({ id });
    }

    const titles = await Promise.all(
      (['companies', 'contacts', 'deals', 'activities', 'tasks'] as const).map((collection) =>
        booted.frogbot.find({ collection, limit: 0, depth: 0, overrideAccess: true }),
      ),
    );

    for (const { docs } of titles) {
      for (const doc of docs) {
        const title = 'name' in doc ? doc.name : doc.title;

        expect(title.length).toBeLessThan(80);
      }
    }

    const { docs: activities } = await booted.frogbot.find({
      collection: 'activities',
      limit: 0,
      overrideAccess: true,
    });

    for (const { start, end } of activities) {
      expect(Date.parse(end!) - Date.parse(start)).toBeLessThanOrEqual(3 * 24 * 60 * 60 * 1000);
    }
  });

  it('dates every record from today, so two runs a day apart shift by exactly a day', async () => {
    await seed({ frogbot: booted.frogbot, today });

    const first = await booted.frogbot.find({
      collection: 'deals',
      sort: 'name',
      limit: 0,
      overrideAccess: true,
    });

    await clearAndSeed(booted.frogbot, 'empty');
    await seed({ frogbot: booted.frogbot, today: new Date('2026-06-16T12:00:00Z') });

    const second = await booted.frogbot.find({
      collection: 'deals',
      sort: 'name',
      limit: 0,
      overrideAccess: true,
    });

    expect(second.docs.map(({ name }) => name)).toEqual(first.docs.map(({ name }) => name));

    second.docs.forEach((deal, index) => {
      expect(Date.parse(deal.closeDate!) - Date.parse(first.docs[index].closeDate!)).toBe(
        24 * 60 * 60 * 1000,
      );
    });
  });

  it('refuses a signed-out request and changes nothing', async () => {
    const response = await post();

    expect(response.status).toBe(403);
    expect((await counts()).companies).toBe(0);
  });

  it('loads the sample once for a signed-in user, then answers 409 and adds nothing', async () => {
    const { headers } = await signUp();

    expect((await post(headers)).body).toEqual({ success: true });

    const first = await counts();
    const again = await post(headers);

    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already has records/);
    expect(await counts()).toEqual(first);
    expect(first.users).toBe(1);
  });

  it('answers a second, concurrent request with 409 and loads the sample once', async () => {
    const { headers } = await signUp();

    const responses = await Promise.all([post(headers), post(headers)]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect((await counts()).companies).toBe(8);
  });

  it('refuses when only one sample collection has a record', async () => {
    const { headers } = await signUp();

    await booted.frogbot.create({
      collection: 'tasks',
      data: { title: 'My own task' },
      overrideAccess: true,
    });

    expect((await post(headers)).status).toBe(409);
    expect((await counts()).companies).toBe(0);
  });

  it('answers 404 in production and changes nothing', async () => {
    const { headers } = await signUp();

    vi.stubEnv('NODE_ENV', 'production');

    expect((await post(headers)).status).toBe(404);
    expect((await counts()).companies).toBe(0);
  });

  it('logs a failing seed and answers 500', async () => {
    const { headers } = await signUp();
    const errors = vi.spyOn(booted.frogbot.logger, 'error');

    const response = await post(headers, brokenSeedPath);

    expect(response.status).toBe(500);
    expect(errors).toHaveBeenCalledWith(
      { err: expect.objectContaining({ message: brokenSeedError }) },
      'Seeding the database failed',
    );
  });
});
