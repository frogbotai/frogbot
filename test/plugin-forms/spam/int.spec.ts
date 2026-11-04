import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type FormDefinition, type FormDocument } from '@frogbotai/plugin-forms';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { leadsSlug } from '../shared.js';
import { rateLimit, turnstileKeys } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';
const siteverifyURL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const alwaysFail = {
  success: false,
  'error-codes': ['invalid-input-response'],
  messages: [],
};

const pass = {
  success: true,
  challenge_ts: '2026-11-03T00:00:00.000Z',
  hostname: 'localhost',
  'error-codes': [],
};

describe(`forms plugin spam protection [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;
  let verdict: unknown;
  let verifications: URLSearchParams[];
  let nextIp = 1;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url !== siteverifyURL) return realFetch(input, init);

      verifications.push(new URLSearchParams(String(init?.body)));

      return Response.json(verdict);
    };

    booted = await bootFrogBot(dirname, 'plugin-forms-spam');
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    verdict = alwaysFail;
    verifications = [];

    await booted.frogbot.create({
      collection: 'forms',
      data: {
        title: 'Contact us',
        slug: 'contact',
        collection: leadsSlug,
        steps: [{ questions: [{ field: 'email' }] }],
      } satisfies Omit<FormDocument, 'id'>,
      overrideAccess: true,
    });
  });

  const freshIp = () => `203.0.113.${nextIp++}`;

  function submit(body: unknown, forwardedFor?: string, slug = 'contact') {
    return booted.restClient.post<Record<string, unknown>>(`/api/forms/${slug}/submit`, body, {
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    });
  }

  async function leadCount() {
    const { totalDocs } = await booted.frogbot.count({
      collection: leadsSlug,
      overrideAccess: true,
    });

    return totalDocs;
  }

  it('sends the site key, never the secret, in the definition', async () => {
    const { body } = await booted.restClient.get<FormDefinition>('/api/forms/contact/definition');

    expect(body.turnstile).toEqual({ siteKey: turnstileKeys.siteKey });
    expect(JSON.stringify(body)).not.toContain(turnstileKeys.secretKey);
  });

  it("refuses a token Cloudflare's always-fail secret rejects, with 400", async () => {
    const ip = freshIp();

    const { status, body } = await submit(
      { data: { email: 'ada@example.com' }, turnstile: 'XXXX.DUMMY.TOKEN.XXXX' },
      ip,
    );

    expect(status).toBe(400);
    expect(body).toEqual({ error: expect.stringContaining('verify') });
    expect(await leadCount()).toBe(0);

    expect(Object.fromEntries(verifications[0])).toEqual({
      secret: turnstileKeys.secretKey,
      response: 'XXXX.DUMMY.TOKEN.XXXX',
      remoteip: ip,
    });
  });

  it('refuses a missing token without asking Cloudflare', async () => {
    const { status } = await submit({ data: { email: 'ada@example.com' } }, freshIp());

    expect(status).toBe(400);
    expect(verifications).toEqual([]);
    expect(await leadCount()).toBe(0);
  });

  it('creates the record when Cloudflare accepts the token', async () => {
    verdict = pass;

    const { status } = await submit(
      { data: { email: 'ada@example.com' }, turnstile: 'XXXX.DUMMY.TOKEN.XXXX' },
      freshIp(),
    );

    expect(status).toBe(200);
    expect(await leadCount()).toBe(1);
  });

  it('answers a filled honeypot with the confirmation before Turnstile, saving nothing', async () => {
    const { status, body } = await submit(
      { data: { email: 'bot@example.com' }, honeypot: 'https://spam.example' },
      freshIp(),
    );

    expect(status).toBe(200);
    expect(body).toEqual({ confirmation: expect.objectContaining({ type: 'message' }) });
    expect(verifications).toEqual([]);
    expect(await leadCount()).toBe(0);
  });

  it('answers the 11th submit from one address with 429, before reading the body', async () => {
    const ip = freshIp();

    for (let index = 0; index < rateLimit.max; index += 1) {
      const { status } = await submit({ data: { email: 'ada@example.com' } }, ip);

      expect(status).toBe(400);
    }

    const limited = await submit('not json', ip, 'missing');

    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(Number(limited.headers.get('retry-after'))).toBeLessThanOrEqual(rateLimit.window);

    expect((await submit({ data: {} }, freshIp())).status).toBe(400);
  });

  it('counts the address the proxy appended, whatever the client put before it', async () => {
    const ip = freshIp();

    for (let index = 0; index < rateLimit.max; index += 1) {
      await submit({ data: { email: 'ada@example.com' } }, `198.51.100.${index}, ${ip}`);
    }

    const { status } = await submit({ data: { email: 'ada@example.com' } }, `192.0.2.1, ${ip}`);

    expect(status).toBe(429);
  });
});
