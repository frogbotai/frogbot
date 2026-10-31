import { createOpenAI } from '@frogbotai/piece-openai';
import type { FrogBotRequest } from 'frogbot';
import { getFrogBotPayload } from 'frogbot/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { bootLinked } from './aiCredentials.js';
import { challenge, idToken, signingKey } from './chatgpt.js';

const ORIGIN = 'http://localhost:3000';
const RETURN_TO = `${ORIGIN}/admin/settings/connections`;
const PLAN_SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';

const key = signingKey('openai-test');
const stranger = signingKey('openai-test');

type Exchange = Record<string, string>;

const auth = {
  exchanges: [] as Exchange[],
  revocations: [] as Exchange[],
  revokeFails: false,
  nonce: '',
};

function tokens(code: string, clientId: string) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: code === 'bad-issuer' ? 'https://evil.test' : 'https://auth.openai.com',
    aud: code === 'bad-audience' ? 'oaiapp_other' : clientId,
    sub: 'chatgpt-user',
    email: 'Alice@Chat.test',
    nonce: code === 'bad-nonce' ? 'another-attempt' : auth.nonce,
    iat: now,
    exp: now + 600,
  };

  return Response.json({
    access_token: `plan-access-${code}`,
    refresh_token: `plan-refresh-${code}`,
    id_token: idToken(code === 'bad-signature' ? stranger : key, claims),
    expires_in: 3600,
    token_type: 'Bearer',
    scope: code === 'no-plan' ? 'openid profile email offline_access' : PLAN_SCOPES,
  });
}

function stubAuth() {
  const realFetch = globalThis.fetch;

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (!url.startsWith('https://auth.openai.com/')) return realFetch(input, init);

      const body = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')));

      if (url.endsWith('/.well-known/jwks.json')) {
        return Promise.resolve(Response.json({ keys: [key.jwk] }));
      }

      if (url.endsWith('/.well-known/openid-configuration')) {
        return Promise.resolve(
          Response.json({ revocation_endpoint: 'https://auth.openai.com/oauth/revoke' }),
        );
      }

      if (url.endsWith('/oauth/revoke')) {
        auth.revocations.push(body);

        return Promise.resolve(new Response(null, { status: auth.revokeFails ? 500 : 200 }));
      }

      auth.exchanges.push(body);

      return Promise.resolve(tokens(body.code, body.client_id));
    }),
  );
}

describe(`Continue with ChatGPT [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let booted: Awaited<ReturnType<typeof bootLinked>>;
  let alice: FrogBotRequest;
  let bob: FrogBotRequest;

  const endpoint = (method: string, path: string) => {
    const payload = getFrogBotPayload(booted.frogbot);
    const found = (payload.collections.connections.config.endpoints || []).find(
      (candidate) => candidate.method === method && candidate.path === path,
    );

    if (!found) throw new Error(`No ${method} ${path} endpoint.`);

    return (req: object) =>
      found.handler({ ...req, payload } as unknown as Parameters<typeof found.handler>[0]);
  };

  const start = async (req: FrogBotRequest) => {
    const response = await endpoint(
      'get',
      '/:piece/authorize',
    )({
      ...req,
      url: `${ORIGIN}/api/connections/openai/authorize?returnTo=${encodeURIComponent('/admin/settings/connections')}`,
      routeParams: { piece: 'openai' },
    });

    expect(response.status).toBe(302);

    const url = new URL(response.headers.get('location')!);

    auth.nonce = url.searchParams.get('nonce')!;

    return url;
  };

  const callback = (url: URL, params: Record<string, string>) =>
    fetch(`${url.searchParams.get('redirect_uri')}?${new URLSearchParams(params)}`, {
      redirect: 'manual',
    });

  const rows = async (req: FrogBotRequest) => booted.frogbot.connections.list({ req });

  const clientKey = (req: FrogBotRequest) =>
    `openai:chatgpt:client:${req.user!.collection}:${req.user!.id}`;

  beforeAll(async () => {
    stubAuth();

    booted = await bootLinked({
      connections: [{ piece: createOpenAI(), oauth: true, secret: true }],
    });

    alice = await booted.member('alice@example.com');
    bob = await booted.member('bob@example.com');
  });

  afterAll(async () => {
    await booted?.frogbot.destroy();
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    await booted.frogbot.delete({ collection: 'connections', where: {}, overrideAccess: true });
    await booted.frogbot.kv.delete(clientKey(alice));
    auth.exchanges.length = 0;
    auth.revocations.length = 0;
    auth.revokeFails = false;
  });

  it('saves the first sign-in for the user who clicked and shows the plan notice once', async () => {
    const url = await start(alice);

    expect(url.searchParams.get('client_id')).toBe('dynamic_agent_client');
    expect(url.searchParams.get('agent_name_hint')).toBe('FrogBot');

    const response = await callback(url, {
      code: 'good',
      state: url.searchParams.get('state')!,
      client_id: 'oaiapp_alice',
      scope: PLAN_SCOPES,
    });

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('You’re using your ChatGPT plan');
    expect(html).toContain(`href="${RETURN_TO}">Got it</a>`);

    expect(auth.exchanges).toEqual([
      {
        grant_type: 'authorization_code',
        client_id: 'oaiapp_alice',
        code: 'good',
        code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        redirect_uri: url.searchParams.get('redirect_uri'),
        resource: 'https://api.openai.com/v1',
      },
    ]);
    expect(challenge(auth.exchanges[0].code_verifier)).toBe(url.searchParams.get('code_challenge'));

    const [row] = await rows(alice);

    expect(row).toMatchObject({
      piece: 'openai',
      method: 'oauth',
      status: 'active',
      account: { id: 'chatgpt-user', label: 'Alice@Chat.test', email: 'alice@chat.test' },
    });
    expect(row.scopes).toContain('chatgpt.tokens.use.direct');
    expect(await rows(bob)).toEqual([]);
    expect(await booted.frogbot.connections.resolve({ piece: createOpenAI(), req: alice })).toEqual(
      { apiKey: 'plan-access-good', chatgpt: { clientId: 'oaiapp_alice' } },
    );
    expect(await booted.frogbot.kv.get(clientKey(alice))).toBe('oaiapp_alice');

    const again = await start(alice);

    expect(again.searchParams.get('client_id')).toBe('oaiapp_alice');
    expect(again.searchParams.has('agent_name_hint')).toBe(false);
    expect(again.searchParams.get('ext_agent_host_id')).toBe(
      url.searchParams.get('ext_agent_host_id'),
    );

    const returning = await callback(again, {
      code: 'good',
      state: again.searchParams.get('state')!,
    });

    expect(returning.status).toBe(302);
    expect(returning.headers.get('location')).toBe(RETURN_TO);
    expect(auth.exchanges[1].client_id).toBe('oaiapp_alice');
  });

  it.each<[string, Record<string, string>, string]>([
    ['a wrong state', { code: 'good', state: 'forged' }, 'This sign-in is out of date.'],
    ['an OAuth error', { error: 'access_denied' }, 'ChatGPT sign-in was stopped: access_denied'],
    ['no code', {}, 'return a sign-in code'],
    [
      'a missing plan scope',
      { code: 'no-plan' },
      'allow plan use. Sign in again and allow it, or paste an OpenAI API key instead.',
    ],
    ['a bad nonce', { code: 'bad-nonce' }, 'returned an invalid sign-in'],
    ['a bad issuer', { code: 'bad-issuer' }, 'returned an invalid sign-in'],
    ['a bad audience', { code: 'bad-audience' }, 'returned an invalid sign-in'],
    ['a bad signature', { code: 'bad-signature' }, 'returned an invalid sign-in'],
  ])('saves nothing on %s', async (_kind, params, message) => {
    const url = await start(alice);
    const response = await callback(url, {
      state: url.searchParams.get('state')!,
      client_id: 'oaiapp_alice',
      ...params,
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain(message);
    expect(await rows(alice)).toEqual([]);
    expect(await booted.frogbot.kv.get(clientKey(alice))).toBeNull();
  });

  it('refuses a callback whose client ID changed from the saved one', async () => {
    await booted.frogbot.kv.set(clientKey(alice), 'oaiapp_alice');

    const url = await start(alice);
    const response = await callback(url, {
      code: 'good',
      state: url.searchParams.get('state')!,
      client_id: 'oaiapp_mallory',
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('a different registration');
    expect(auth.exchanges).toEqual([]);
    expect(await rows(alice)).toEqual([]);
  });

  it.each([false, true])(
    'disconnect revokes, then deletes, and keeps the client and host IDs (revoke fails: %s)',
    async (fails) => {
      const first = await start(alice);

      await callback(first, {
        code: 'good',
        state: first.searchParams.get('state')!,
        client_id: 'oaiapp_alice',
      });

      const [row] = await rows(alice);

      auth.revokeFails = fails;

      const response = await endpoint(
        'delete',
        '/:id',
      )({ ...alice, routeParams: { id: String(row.id) } });

      expect(response.status).toBe(204);
      expect(auth.revocations).toEqual([
        { token: 'plan-refresh-good', token_type_hint: 'refresh_token', client_id: 'oaiapp_alice' },
      ]);
      expect(await rows(alice)).toEqual([]);

      const next = await start(alice);

      expect(next.searchParams.get('client_id')).toBe('oaiapp_alice');
      expect(next.searchParams.has('agent_name_hint')).toBe(false);
      expect(next.searchParams.get('ext_agent_host_id')).toBe(
        first.searchParams.get('ext_agent_host_id'),
      );
    },
  );
});
