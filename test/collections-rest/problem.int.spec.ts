import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { projectsSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('routed errors are Problems', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  it('collection validation: 400 request.invalid, problem+json, field errors kept, request id', async () => {
    const res = await fetch(`${booted.baseUrl}/api/${projectsSlug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(body.code).toBe('request.invalid');
    expect(body.errors[0].data.errors[0].path).toBe('title');
    expect(res.headers.get('x-request-id')).toBe(body.requestId);
  });

  it('answers a path no route matches with route.not-found', async () => {
    const res = await fetch(`${booted.baseUrl}/api/no-such-collection`, {
      method: 'POST',
      headers: { 'x-request-id': 'req_unknown' },
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(res.headers.get('x-request-id')).toBe('req_unknown');
    expect(await res.json()).toMatchObject({
      code: 'route.not-found',
      detail: 'No POST route at /api/no-such-collection.',
      requestId: 'req_unknown',
    });

    const direct = await booted.frogbot.handleRequest(
      new Request('http://localhost/api/no-such-collection/extra'),
    );

    expect(await direct.json()).toMatchObject({ code: 'route.not-found' });
  });

  it('echoes an incoming X-Request-Id and maps NotFound', async () => {
    const res = await fetch(`${booted.baseUrl}/api/${projectsSlug}/999999`, {
      headers: { 'x-request-id': 'abc-123' },
    });

    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('doc.not-found');
    expect(res.headers.get('x-request-id')).toBe('abc-123');
  });

  it('answers a malformed JSON body with a 400 Problem', async () => {
    const res = await fetch(`${booted.baseUrl}/api/${projectsSlug}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"title":',
    });

    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(body.code).toBe('request.invalid-json');
  });

  it('answers a bad where query with request.invalid-query', async () => {
    const res = await fetch(`${booted.baseUrl}/api/${projectsSlug}?where[nope][equals]=1`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('request.invalid-query');
  });
});
