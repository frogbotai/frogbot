import { connect } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceInstanceDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceOAuthSignIn } from '../../../packages/frogbot/src/pieces/types.js';
import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createOpenAI } from '../../../packages/pieces/piece-openai/src/index.js';

const signIn = pieceInstanceDefinition(createOpenAI()).oauth as PieceOAuthSignIn<unknown>;

function memoryKV() {
  const values = new Map<string, unknown>();

  return {
    values,
    get: (key: string) => Promise.resolve(values.get(key)),
    set: (key: string, value: unknown) => {
      values.set(key, value);

      return Promise.resolve();
    },
    setIfAbsent: (key: string, value: unknown) => {
      if (values.has(key)) return Promise.resolve(false);

      values.set(key, value);

      return Promise.resolve(true);
    },
  };
}

function request(kv = memoryKV(), id: number | string = 7) {
  return {
    kv,
    req: { user: { id, collection: 'users' }, frogbot: { kv } } as never as FrogBotRequest,
  };
}

async function authorize(req: FrogBotRequest) {
  const url = new URL(
    await signIn.authorize({ req, returnTo: 'http://localhost:3000/admin', save: vi.fn() }),
  );

  await fetch(`${url.searchParams.get('redirect_uri')}?error=test`).catch(() => undefined);

  return url;
}

function stubFetch(handler: (url: string, body: URLSearchParams) => Response) {
  const realFetch = globalThis.fetch;
  const calls: { url: string; body: URLSearchParams }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (!url.startsWith('https://auth.openai.com/')) return realFetch(input, init);

      const body = new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : '');

      calls.push({ url, body });

      return Promise.resolve(handler(url, body));
    }),
  );

  return calls;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Continue with ChatGPT', () => {
  it('registers on the first sign-in with OpenCode parameters and the FrogBot agent name', async () => {
    const { req, kv } = request();
    const url = await authorize(req);
    const host = kv.values.get('openai:chatgpt:host');

    expect(`${url.origin}${url.pathname}`).toBe('https://auth.openai.com/api/accounts/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'dynamic_agent_client',
      agent_name_hint: 'FrogBot',
      ext_agent_host_id: host,
      response_type: 'code',
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
      resource: 'https://api.openai.com/v1',
      code_challenge_method: 'S256',
    });
    expect(host).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
    expect(url.searchParams.get('redirect_uri')).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/,
    );

    for (const name of ['state', 'nonce', 'code_challenge']) {
      expect(url.searchParams.get(name)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('reuses the saved client ID and the same host ID later, with no agent name', async () => {
    const { req, kv } = request();
    const first = await authorize(req);

    kv.values.set('openai:chatgpt:client:users:7', 'oaiapp_saved');

    const later = await authorize(req);

    expect(later.searchParams.get('client_id')).toBe('oaiapp_saved');
    expect(later.searchParams.has('agent_name_hint')).toBe(false);
    expect(later.searchParams.get('ext_agent_host_id')).toBe(
      first.searchParams.get('ext_agent_host_id'),
    );
    expect(later.searchParams.get('state')).not.toBe(first.searchParams.get('state'));
    expect(later.searchParams.get('nonce')).not.toBe(first.searchParams.get('nonce'));
  });

  it("keeps each user's client ID apart", async () => {
    const kv = memoryKV();

    kv.values.set('openai:chatgpt:client:users:7', 'oaiapp_seven');

    const other = await authorize(request(kv, 8).req);

    expect(other.searchParams.get('client_id')).toBe('dynamic_agent_client');
  });

  it("closes the user's previous listener when they start again", async () => {
    const { req } = request();
    const first = new URL(
      await signIn.authorize({ req, returnTo: 'http://localhost:3000/admin', save: vi.fn() }),
    );

    await authorize(req);

    await expect(fetch(first.searchParams.get('redirect_uri')!)).rejects.toThrow();
  });

  it('closes an unused listener after 10 minutes', async () => {
    const reachable = (port: number) =>
      new Promise<boolean>((resolve) => {
        const socket = connect({ host: '127.0.0.1', port });

        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });

        socket.once('error', () => resolve(false));
      });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const { req } = request();
    const url = new URL(
      await signIn.authorize({ req, returnTo: 'http://localhost:3000/admin', save: vi.fn() }),
    );

    const port = Number(new URL(url.searchParams.get('redirect_uri')!).port);

    vi.advanceTimersByTime(10 * 60 * 1000 - 1);

    expect(await reachable(port)).toBe(true);

    vi.advanceTimersByTime(1);

    expect(await reachable(port)).toBe(false);
  });

  it('refreshes with the issued client ID and the resource', async () => {
    const calls = stubFetch(() =>
      Response.json({ access_token: 'next', refresh_token: 'refresh-2', expires_in: 3600 }),
    );

    const { req } = request();

    await expect(
      signIn.refresh({
        tokens: { access_token: 'old', refresh_token: 'refresh-1', client_id: 'oaiapp_1' },
        req,
      }),
    ).resolves.toMatchObject({ access_token: 'next', refresh_token: 'refresh-2' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://auth.openai.com/api/accounts/oauth/token');
    expect(Object.fromEntries(calls[0].body)).toEqual({
      grant_type: 'refresh_token',
      client_id: 'oaiapp_1',
      refresh_token: 'refresh-1',
      resource: 'https://api.openai.com/v1',
    });
  });

  it('fails a refresh OpenAI refuses', async () => {
    stubFetch(() => Response.json({ error: 'invalid_grant' }, { status: 400 }));

    await expect(
      signIn.refresh({
        tokens: { access_token: 'old', refresh_token: 'refresh-1', client_id: 'oaiapp_1' },
        req: request().req,
      }),
    ).rejects.toThrow('400');
  });

  it("revokes the refresh token at the discovery document's revocation endpoint", async () => {
    const calls = stubFetch((url) =>
      url.endsWith('/openid-configuration')
        ? Response.json({ revocation_endpoint: 'https://auth.openai.com/oauth/revoke' })
        : new Response(null, { status: 200 }),
    );

    await signIn.revoke!({
      tokens: { access_token: 'old', refresh_token: 'refresh-1', client_id: 'oaiapp_1' },
      req: request().req,
    });

    expect(calls.map(({ url }) => url)).toEqual([
      'https://auth.openai.com/.well-known/openid-configuration',
      'https://auth.openai.com/oauth/revoke',
    ]);
    expect(Object.fromEntries(calls[1].body)).toEqual({
      token: 'refresh-1',
      token_type_hint: 'refresh_token',
      client_id: 'oaiapp_1',
    });
  });

  it('maps tokens to the plan auth', () => {
    expect(
      signIn.auth!.parse(
        signIn.toAuth!({ tokens: { access_token: 'plan-token', client_id: 'oaiapp_1' } }),
      ),
    ).toEqual({ apiKey: 'plan-token', chatgpt: { clientId: 'oaiapp_1' } });
    expect(() => signIn.auth!.parse(signIn.toAuth!({ tokens: { access_token: 'x' } }))).toThrow();
  });
});
