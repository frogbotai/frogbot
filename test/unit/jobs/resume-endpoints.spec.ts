import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildResumeEndpoints } from '../../../packages/frogbot/src/jobs/endpoints/resume.js';
import type { Waitpoint } from '../../../packages/frogbot/src/jobs/waitpoints/types.js';

const operations = vi.hoisted(() => ({
  findWaitpoint: vi.fn(),
  resumeWaitpoint: vi.fn(),
  WaitpointResumeError: class extends Error {
    constructor(
      public status: 404 | 409 | 410,
      public code: string,
    ) {
      super('Private storage details');
    }
  },
}));

vi.mock('../../../packages/frogbot/src/jobs/waitpoints/operations.js', () => operations);

const token = 'secret-resume-token';
const now = new Date('2026-09-13T12:00:00Z');
const endpoints = buildResumeEndpoints();

function waitpoint(overrides: Partial<Waitpoint> = {}): Waitpoint {
  return {
    id: 41,
    jobId: 'private-source-job',
    name: '<script>alert("private wait name")</script>',
    token,
    kind: 'resumable',
    ready: true,
    status: 'pending',
    expiresAt: '2026-09-14T12:00:00Z',
    snapshot: {
      workflow: 'private-workflow',
      input: { secret: 'private-input' },
      queue: 'private-queue',
      log: [],
    },
    dispatched: false,
    ...overrides,
  };
}

function request({
  method = 'GET',
  body,
  contentType,
  routeToken = token,
}: {
  method?: string;
  body?: string;
  contentType?: string;
  routeToken?: unknown;
} = {}) {
  return Object.assign(
    new Request(`https://example.com/custom-api/jobs/${token}/resume?untrusted=<script>`, {
      method,
      headers: contentType ? { 'content-type': contentType } : {},
      body,
    }),
    { routeParams: { token: routeToken }, payload: {}, context: {} },
  );
}

function handle(req: ReturnType<typeof request>) {
  const endpoint = endpoints.find(({ method }) => method === req.method.toLowerCase());

  if (!endpoint) throw new Error('Missing test endpoint');

  return endpoint.handler(req as never);
}

function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);

  operations.findWaitpoint.mockReset().mockResolvedValue(waitpoint());
  operations.resumeWaitpoint.mockReset().mockResolvedValue({ jobId: 'private-continuation-job' });
});

afterEach(() => vi.useRealTimers());

describe('resume confirmation', () => {
  it('renders a private, script-free POST confirmation without resuming', async () => {
    const req = request();

    const response = await handle(req);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expectPrivate(response);

    expect(html).toContain('<title>Resume workflow · FrogBot</title>');
    expect(html).toContain('<form method="post">');
    expect(html).toContain('<button type="submit">Resume workflow</button>');
    expect(html).not.toMatch(/<script|<link|<img|\saction=|\sname="(?:token|approved)"/);
    expect(html).not.toContain(token);
    expect(html).not.toContain('private-');
    expect(html).not.toContain('untrusted');

    const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];

    expect(style).toBeDefined();
    expect(response.headers.get('content-security-policy')).toContain(
      `'sha256-${createHash('sha256').update(style!).digest('base64')}'`,
    );
    expect(response.headers.get('content-security-policy')).toContain("form-action 'self'");
    expect(response.headers.get('content-security-policy')).toContain("base-uri 'none'");
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(operations.findWaitpoint).toHaveBeenCalledWith({ req, token });
    expect(operations.resumeWaitpoint).not.toHaveBeenCalled();
  });

  it('allows confirmation while the creator is still preparing the wait', async () => {
    operations.findWaitpoint.mockResolvedValue(waitpoint({ ready: false }));

    const response = await handle(request());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<form method="post">');
    expect(operations.resumeWaitpoint).not.toHaveBeenCalled();
  });

  it.each([
    { row: null, status: 404, title: 'Link not found' },
    { row: undefined, status: 404, title: 'Link not found' },
    { row: waitpoint({ kind: 'delay' }), status: 404, title: 'Link not found' },
    { row: waitpoint({ status: 'resumed' }), status: 409, title: 'Link already used' },
    {
      row: waitpoint({ status: 'resumed', expiresAt: now.toISOString() }),
      status: 409,
      title: 'Link already used',
    },
    { row: waitpoint({ status: 'expired' }), status: 410, title: 'Link expired' },
    {
      row: waitpoint({ expiresAt: now.toISOString() }),
      status: 410,
      title: 'Link expired',
    },
    {
      row: waitpoint({ expiresAt: '2026-09-12T12:00:00Z' }),
      status: 410,
      title: 'Link expired',
    },
    {
      row: waitpoint({ expiresAt: 'invalid' }),
      status: 500,
      title: 'Unable to process response',
    },
  ])('returns $status with no confirmation for $title ($row)', async ({ row, status, title }) => {
    operations.findWaitpoint.mockResolvedValue(row);

    const response = await handle(request());
    const html = await response.text();

    expect(response.status).toBe(status);
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).not.toContain('<form');
    expect(html).not.toContain(token);
    expectPrivate(response);
    expect(operations.resumeWaitpoint).not.toHaveBeenCalled();
  });

  it.each([
    { row: waitpoint(), status: 200 },
    { row: null, status: 404 },
    { row: waitpoint({ status: 'resumed' }), status: 409 },
    { row: waitpoint({ expiresAt: now.toISOString() }), status: 410 },
  ])('HEAD returns $status without a body or mutation', async ({ row, status }) => {
    operations.findWaitpoint.mockResolvedValue(row);

    const response = await handle(request({ method: 'HEAD' }));

    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
    expect(await response.text()).toBe('');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expectPrivate(response);
    expect(operations.resumeWaitpoint).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD'])(
    'keeps lookup failures distinct from stale links on %s',
    async (method) => {
      operations.findWaitpoint.mockRejectedValue(new Error(`Database failure: ${token}`));

      const response = await handle(request({ method }));
      const body = await response.text();

      expect(response.status).toBe(500);
      expect(body).not.toContain(token);
      expect(body).not.toContain('Database failure');
      expectPrivate(response);
      expect(operations.resumeWaitpoint).not.toHaveBeenCalled();
    },
  );
});

describe('resume submission', () => {
  it.each(['GET', 'HEAD', 'POST'])(
    'rejects a missing token on %s before calling storage',
    async (method) => {
      const response = await handle(
        request({
          method,
          routeToken: '',
          ...(method === 'POST' ? { contentType: 'application/json', body: '{}' } : {}),
        }),
      );

      expect(response.status).toBe(404);
      expectPrivate(response);
      expect(operations.findWaitpoint).not.toHaveBeenCalled();
      expect(operations.resumeWaitpoint).not.toHaveBeenCalled();
    },
  );

  it.each([{}, { data: { answer: 'yes' }, other: 1 }, [1, 'two'], null, false, 7, 'yes'])(
    'passes the entire JSON value unchanged as resume data (%j)',
    async (data) => {
      const req = request({
        method: 'POST',
        contentType: 'Application/JSON; charset=utf-8',
        body: JSON.stringify(data),
      });

      const response = await handle(req);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expectPrivate(response);
      expect(operations.resumeWaitpoint).toHaveBeenCalledExactlyOnceWith({ req, token, data });
      expect(operations.findWaitpoint).not.toHaveBeenCalled();
    },
  );

  it('records a human confirmation with empty data and no invented approval value', async () => {
    const req = request({
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      body: '',
    });

    const response = await handle(req);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Your response has been recorded. You can close this page now.');
    expect(html).not.toContain('<form');
    expect(html).not.toContain(token);
    expect(html).not.toContain('private-');
    expectPrivate(response);
    expect(operations.resumeWaitpoint).toHaveBeenCalledExactlyOnceWith({ req, token, data: {} });
  });

  it('returns a stable acknowledgement when acceptance is buffered before readiness', async () => {
    operations.resumeWaitpoint.mockResolvedValue({});

    const response = await handle(
      request({ method: 'POST', contentType: 'application/json', body: '{}' }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it.each([
    { contentType: undefined, body: '{}', status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' },
    { contentType: 'text/plain', body: '{}', status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' },
    { contentType: 'multipart/form-data', body: '', status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' },
    { contentType: 'application/json', body: '', status: 400, code: 'INVALID_JSON' },
    { contentType: 'application/json', body: '{', status: 400, code: 'INVALID_JSON' },
    { contentType: 'application/json', body: 'undefined', status: 400, code: 'INVALID_JSON' },
  ])('rejects malformed input: $contentType $body', async ({ contentType, body, status, code }) => {
    const response = await handle(request({ method: 'POST', contentType, body }));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
    expectPrivate(response);
    expect(operations.resumeWaitpoint).not.toHaveBeenCalled();
  });

  it('rejects form fields rather than silently discarding caller data', async () => {
    const response = await handle(
      request({
        method: 'POST',
        contentType: 'application/x-www-form-urlencoded',
        body: 'data=yes',
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Invalid response');
    expect(operations.resumeWaitpoint).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: 404 as const,
      code: 'WAITPOINT_NOT_FOUND',
      message: 'This resume link is not available.',
    },
    {
      status: 409 as const,
      code: 'WAITPOINT_CONSUMED',
      message: 'This resume link has already been used.',
    },
    { status: 410 as const, code: 'WAITPOINT_EXPIRED', message: 'This resume link has expired.' },
  ])(
    'maps the canonical $status error without exposing internal details',
    async ({ status, code, message }) => {
      operations.resumeWaitpoint.mockRejectedValue(
        new operations.WaitpointResumeError(status, code),
      );

      const json = await handle(
        request({ method: 'POST', contentType: 'application/json', body: '{}' }),
      );
      const html = await handle(
        request({ method: 'POST', contentType: 'application/x-www-form-urlencoded', body: '' }),
      );

      expect(json.status).toBe(status);
      expect(await json.json()).toEqual({ error: { code, message } });
      expectPrivate(json);
      expect(html.status).toBe(status);
      expect(await html.text()).toContain(message);
      expectPrivate(html);
    },
  );

  it.each([
    new Error(`Database unavailable: ${token}`),
    Object.assign(new Error('Not a waitpoint error'), { status: 404, code: 'NOT_FOUND' }),
    new SyntaxError('An operation failure is not malformed request JSON'),
  ])('does not misclassify unexpected operation failures (%s)', async (error) => {
    operations.resumeWaitpoint.mockRejectedValue(error);

    const response = await handle(
      request({ method: 'POST', contentType: 'application/json', body: '{}' }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'FrogBot could not process this request. Please try again later.',
      },
    });
    expectPrivate(response);
  });

  it('distinguishes request stream failures from invalid JSON', async () => {
    const req = request({ method: 'POST', contentType: 'application/json', body: '{}' });

    vi.spyOn(req, 'text').mockRejectedValue(new Error('Request stream failed'));

    const response = await handle(req);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expectPrivate(response);
    expect(operations.resumeWaitpoint).not.toHaveBeenCalled();
  });
});
