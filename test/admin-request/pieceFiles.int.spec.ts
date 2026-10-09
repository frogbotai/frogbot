import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FrogBotRequest } from 'frogbot';
import { createPieceHelpers, definePiece } from 'frogbot/pieces';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { filesSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const { defineCustomApiCall } = createPieceHelpers();

const createFake = definePiece({
  slug: 'fake',
  label: 'Fake',
  actions: [
    defineCustomApiCall({
      name: 'Fake',
      baseUrl: 'https://api.fake.test',
      authorize: ({ headers }) => headers.set('authorization', 'Bearer fake'),
    }),
  ],
});

const fake = createFake();
const pdf = new Uint8Array([37, 80, 68, 70]);

describe('customApiCall binary responses', () => {
  let booted: BootedFrogBot;
  let req: FrogBotRequest;
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(pdf, { headers: { 'content-type': 'application/pdf' } })),
  );

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'admin-request-piece-files');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'files@frogbot.local', password: 'files-password' },
    });

    req = await booted.frogbot.createRequest({
      user: { ...user, collection: usersSlug } as never,
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockClear();
  });

  it('saves the response as a files document owned by the request', async () => {
    const result = await fake.customApiCall({
      input: { method: 'GET', path: '/reports/q3.pdf', responseType: 'binary' },
      req,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ name: 'q3.pdf', mimeType: 'application/pdf', size: 4 });

    const { id } = result.body as { id: number | string };
    const doc = await booted.frogbot.findByID({ collection: filesSlug, id, overrideAccess: true });

    expect(doc).toMatchObject({ filename: 'q3.pdf', mimeType: 'application/pdf', filesize: 4 });
  });

  it('checks files access as the caller', async () => {
    const anonymous = await booted.frogbot.createRequest({ user: null });

    await expect(
      fake.customApiCall({
        input: { method: 'GET', path: '/reports/q3.pdf', responseType: 'binary' },
        req: anonymous,
      }),
    ).rejects.toThrow(/not allowed/);

    const { totalDocs } = await booted.frogbot.find({
      collection: filesSlug,
      overrideAccess: true,
    });

    expect(totalDocs).toBe(0);
  });

  it('throws before fetch when the app has no files collection', async () => {
    const config = {
      ...req.frogbot.config,
      files: undefined,
    } as FrogBotRequest['frogbot']['config'];

    const noFiles = Object.assign(Object.create(req) as FrogBotRequest, {
      frogbot: Object.assign(Object.create(req.frogbot) as FrogBotRequest['frogbot'], { config }),
    });

    await expect(
      fake.customApiCall({
        input: { method: 'GET', path: '/reports/q3.pdf', responseType: 'binary' },
        req: noFiles,
      }),
    ).rejects.toThrow(
      '[frogbot] Fake requires a files collection. Add an upload collection with `file: true`.',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
