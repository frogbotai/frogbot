import { describe, expect, it } from 'vitest';

import { createFrogBotSDK, type UntypedFrogBotSDKTypes } from '../../../packages/sdk/src/index';
import { baseURL, createClients } from './clients';

type Client = ReturnType<typeof createClients>['frogbot'];
type Call = (client: Client, init?: RequestInit) => Promise<unknown>;

const calls: { name: string; call: Call }[] = [
  {
    name: 'login',
    call: (sdk, init) =>
      sdk.login(
        { collection: 'sdk-users', data: { email: 'frog@example.com', password: 'ribbit' } },
        init,
      ),
  },
  { name: 'me', call: (sdk, init) => sdk.me({ collection: 'sdk-users' }, init) },
  {
    name: 'refreshToken',
    call: (sdk, init) => sdk.refreshToken({ collection: 'sdk-users' }, init),
  },
  {
    name: 'forgotPassword',
    call: (sdk, init) =>
      sdk.forgotPassword({ collection: 'sdk-users', data: { email: 'frog@example.com' } }, init),
  },
  {
    name: 'resetPassword',
    call: (sdk, init) =>
      sdk.resetPassword(
        { collection: 'sdk-users', data: { password: 'croak', token: 'reset-token' } },
        init,
      ),
  },
  {
    name: 'verifyEmail',
    call: (sdk, init) => sdk.verifyEmail({ collection: 'sdk-users', token: 'verify-token' }, init),
  },
];

const authHeaders = [
  { name: 'a JWT header', headers: { Authorization: 'JWT user-token' } },
  { name: 'an API-key header', headers: { Authorization: 'Bearer frogbot-api-key' } },
];

describe('FrogBotSDK auth methods', () => {
  it.each(calls)('$name sends the same request as the Payload client', async ({ call }) => {
    const { frogbot, frogbotRequests, payload, payloadRequests } = createClients(() =>
      Response.json({ message: 'ok', user: { id: 1 } }),
    );

    await call(frogbot);
    await call(payload as unknown as Client);

    expect(frogbotRequests).toHaveLength(1);
    expect(frogbotRequests).toEqual(payloadRequests);
  });

  it.each(calls)('$name returns the response body', async ({ call }) => {
    const body = {
      exp: 1,
      message: 'ok',
      token: 'token',
      user: { email: 'frog@example.com', id: 1 },
    };
    const { frogbot } = createClients(() => Response.json(body));

    const result = await call(frogbot);

    expect(result).toEqual(body);
  });

  it.each(authHeaders)('me passes $name to fetch unchanged', async ({ headers }) => {
    const { frogbot, frogbotRequests } = createClients(() => Response.json({ user: null }));

    await frogbot.me({ collection: 'sdk-users' }, { headers });

    expect(frogbotRequests[0]?.headers.authorization).toBe(headers.Authorization);
  });

  it('passes credentials and base headers to a custom fetch', async () => {
    const inits: RequestInit[] = [];

    const sdk = createFrogBotSDK<UntypedFrogBotSDKTypes>({
      baseURL,
      fetch: (_input, init) => {
        inits.push(init ?? {});

        return Promise.resolve(Response.json({ user: null }));
      },
      headers: { 'X-Base': 'base' },
    });

    await sdk.me({ collection: 'sdk-users' }, { credentials: 'include' });

    expect(inits[0]?.credentials).toBe('include');
    expect(inits[0]?.method).toBe('GET');
    expect(new Headers(inits[0]?.headers).get('x-base')).toBe('base');
  });
});
