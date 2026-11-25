import { CallCredentialError, GatewayError } from '@frogbotai/gateway/errors';
import { APIError, FileRetrievalError, Forbidden, NotFound, ValidationError } from 'payload';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toolErrorText } from '../../../../packages/frogbot/src/chat/toolErrorText.js';
import { buildConnectionOAuthEndpoints } from '../../../../packages/frogbot/src/connections/endpoints.js';
import type { SanitizedConnectionsConfig } from '../../../../packages/frogbot/src/connections/types.js';
import { problemAfterError } from '../../../../packages/frogbot/src/errors/afterError.js';
import {
  defineErrors,
  isFrogBotError,
} from '../../../../packages/frogbot/src/errors/FrogBotError.js';
import { gatewayFrogBotError } from '../../../../packages/frogbot/src/errors/gateway.js';
import { toProblem } from '../../../../packages/frogbot/src/errors/toProblem.js';
import { kvLeaseLost, kvLockHeld } from '../../../../packages/frogbot/src/kv/errors.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';
import { routed } from '../../../__helpers/shared/routed.js';
import { definition, setup } from '../connections/oauth/fixtures.js';

describe('toProblem leaks and statuses', () => {
  it('hides a FileRetrievalError cause message, as Payload does (500, not public)', () => {
    const error = new FileRetrievalError(undefined, 'ENOENT: /srv/secret/uploads/key.pem');
    const problem = toProblem(error);

    expect(problem.status).toBe(500);
    expect(JSON.stringify(problem)).not.toContain('/srv/secret');
  });

  it('keeps the status of a hidden 4xx APIError', () => {
    const problem = toProblem(new APIError('private reason', 409, null, false));

    expect(JSON.stringify(problem)).not.toContain('private reason');
    expect(problem.status).toBe(409);
  });
});

describe('gateway errors outside the agent endpoint', () => {
  it('maps a GatewayError to its ai.* code, keeping status and message', () => {
    const problem = toProblem(
      new CallCredentialError('Set OPENAI_API_KEY in .env, or link an OpenAI account.'),
    );

    expect(problem.code).toBe('ai.no-credential');
    expect(problem.status).toBe(401);
    expect(problem.detail).toContain('OPENAI_API_KEY');
  });

  it('gives a failed tool call the ai.* code, not internal', () => {
    expect(toolErrorText(new CallCredentialError('Set OPENAI_API_KEY.'))).toMatch(
      /^ai\.no-credential: /,
    );
  });
});

describe('oauthFailure re-raises a plugin FrogBotError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps a plugin code, its status, and the cookie-clearing headers', async () => {
    const pluginError = defineErrors({
      'acme.quota': { status: 429, title: 'Quota.', hint: 'Wait.', retryable: true },
    });

    const base = setup(definition);
    const upsert = vi.fn().mockRejectedValue(pluginError('acme.quota', 'Over quota.'));
    const config = {
      serverURL: 'https://app.test',
      routes: { api: '/rest/v1', admin: '/control' },
      admin: { user: 'users' },
      cookiePrefix: 'payload',
    };

    const connections: SanitizedConnectionsConfig = {
      enabled: true,
      slug: 'connections',
      encryption: base.encryption,
      entries: { example: { piece: base.piece, oauth: true, secret: true } },
      apps: {},
    };

    const endpoints = buildConnectionOAuthEndpoints({ connections, userSlug: 'users' });
    const request = (url: string, cookie = '') =>
      ({
        url,
        user: base.req.user,
        routeParams: { piece: 'example' },
        headers: new Headers({ cookie }),
        i18n: { language: 'en' },
        t: (key: string) => key,
        frogbot: {
          kv: base.kv,
          logger: { warn: vi.fn() },
          config: { _internal: { payloadConfig: Promise.resolve(config) } },
          connections: { store: Promise.resolve({ upsert }) },
          findByID: vi.fn().mockResolvedValue({ id: 'owner' }),
        },
      }) as unknown as FrogBotRequest;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(Response.json({ access_token: 't' }))),
    );

    const started = await routed(() => endpoints[0].handler(request('https://app.test/authorize')));
    const provider = new URL(started.headers.get('location')!);
    const cookie = started.headers.get('set-cookie')!.split(';')[0];
    const callback = `${provider.searchParams.get('redirect_uri')}?state=${provider.searchParams.get('state')}&code=c`;

    const response = await routed(() => endpoints[1].handler(request(callback, cookie)));
    const body = await response.json();

    expect(upsert).toHaveBeenCalledOnce();
    expect(body.code).toBe('acme.quota');
    expect(response.status).toBe(429);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

describe('internal errors and the request id in the log', () => {
  it('logs the request id an internal Problem tells the caller to look up', async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const req = {
      headers: new Headers({ 'x-request-id': 'req_lookup' }),
      payload: { config: { debug: false }, logger },
    };

    const result = (await problemAfterError({
      error: new Error('db password=hunter2'),
      req,
    } as never)) as { response: { code: string; requestId: string; detail: string } };

    expect(result.response.code).toBe('internal');
    expect(result.response.detail).not.toContain('hunter2');
    expect(JSON.stringify([...logger.error.mock.calls, ...logger.warn.mock.calls])).toContain(
      'req_lookup',
    );
  });
});

describe('toProblem codes', () => {
  it.each([
    [new NotFound(), 404, 'doc.not-found'],
    [new Forbidden(), 403, 'auth.forbidden'],
    [
      new ValidationError({
        collection: 'posts',
        errors: [{ path: 'title', message: 'Required.' }],
      }),
      400,
      'request.invalid',
    ],
    [new APIError('Plan limit reached.', 402), 402, 'request.rejected'],
    [new APIError('Invalid JSON', 400), 400, 'request.invalid-json'],
  ])('maps a Payload %s to its code and status', (error, status, code) => {
    expect(toProblem(error)).toMatchObject({
      status,
      code,
      type: `https://docs.frogbot.ai/errors#${code}`,
    });
  });

  it('keeps Payload validation entries in errors[] for existing clients', () => {
    const problem = toProblem(
      new ValidationError({
        collection: 'posts',
        errors: [{ path: 'title', message: 'Required.' }],
      }),
    );

    expect(problem.errors[0]).toMatchObject({
      name: 'ValidationError',
      data: { errors: [{ path: 'title', message: 'Required.' }] },
    });
  });

  it('hides an unknown error unless debug is on', () => {
    const error = new Error('db password=hunter2');

    expect(toProblem(error)).toMatchObject({
      code: 'internal',
      status: 500,
      detail: 'Something went wrong.',
    });
    expect(JSON.stringify(toProblem(error))).not.toContain('hunter2');
    expect(toProblem(error, { debug: true }).detail).toBe('db password=hunter2');
  });

  it('tells a signed-out caller refused by an access rule to sign in', () => {
    expect(toProblem(new Forbidden(), { signedIn: false }).hint).toContain('Sign in');
  });

  it('keeps a plugin code and its data, and recognises it by shape', () => {
    const acme = defineErrors({
      'acme.quota': { status: 429, title: 'Quota.', hint: 'Wait.', retryable: true },
    });

    const error = acme('acme.quota', { detail: 'Over quota.', data: { limit: 5 }, retryAfter: 30 });

    expect(isFrogBotError(error, 'acme.quota')).toBe(true);
    expect(toProblem(error, { requestId: 'req_1' })).toMatchObject({
      code: 'acme.quota',
      status: 429,
      detail: 'Over quota.',
      retryable: true,
      retryAfter: 30,
      data: { limit: 5 },
      requestId: 'req_1',
    });
  });
});

describe('review fix list for PR #704', () => {
  it('leaves GraphQL errors to Payload: no Problem headers, no internal log', async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const req = { headers: new Headers(), payload: { config: { debug: false }, logger } } as {
      responseHeaders?: Headers;
    };

    const result = await problemAfterError({
      error: new Error('Cannot query field "nope"'),
      graphqlResult: { message: 'Cannot query field "nope"' },
      req,
    } as never);

    expect(result).toBeUndefined();
    expect(req.responseHeaders?.get('content-type') ?? null).toBeNull();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('drops the data of a hidden APIError from errors[]', () => {
    const problem = toProblem(new APIError('private', 409, { ownerKey: 'secret-owner' }, false));

    expect(JSON.stringify(problem)).not.toContain('secret-owner');
  });

  it('hides a 500 gateway error as internal', () => {
    const error = new GatewayError({
      code: 'config_invalid',
      status: 500,
      message: 'OPENAI_BASE_URL=http://10.0.0.5:8080 is invalid',
    });

    expect(gatewayFrogBotError(error).code).toBe('internal');
    expect(toProblem(error)).toMatchObject({ code: 'internal', status: 500 });
    expect(JSON.stringify(toProblem(error))).not.toContain('10.0.0.5');
  });

  it('keeps KV lock keys out of the response', () => {
    for (const error of [kvLockHeld('auth:user:42'), kvLeaseLost('auth:user:42')]) {
      const problem = toProblem(error);

      expect(problem.status).toBe(409);
      expect(problem.retryable).toBe(true);
      expect(JSON.stringify(problem)).not.toContain('user:42');
    }
  });

  it('keeps the message of an APIError marked public at 5xx', () => {
    expect(
      toProblem(new APIError('Upstream search index is rebuilding.', 503, null, true)),
    ).toMatchObject({
      status: 503,
      detail: 'Upstream search index is rebuilding.',
    });
  });
});
