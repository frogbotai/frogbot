import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import {
  microsoftCloud,
  microsoftClouds,
  microsoftEnvironment,
  microsoftOAuth,
  microsoftScopes,
} from '../../../packages/pieces/piece-microsoft/src/index.js';

const signal = new AbortController().signal;
const req = { signal } as unknown as FrogBotRequest;

function stubMe(body: unknown, status = 200) {
  const fetch = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(Response.json(body, { status })),
  );

  vi.stubGlobal('fetch', fetch);

  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('Microsoft sign-in recipe', () => {
  it('defaults to the commercial cloud and the common tenant', () => {
    expect(microsoftEnvironment.parse({})).toEqual({ cloud: 'commercial', tenantId: 'common' });
    expect(microsoftOAuth()).toMatchObject({
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: { catalog: microsoftScopes, defaults: [], required: ['offline_access', 'User.Read'] },
      params: { prompt: 'select_account' },
    });
  });

  it('puts the cloud host and the encoded tenant in both URLs', () => {
    expect(microsoftOAuth({ cloud: 'usGovernment', tenantId: 'contoso/x' })).toMatchObject({
      authorizationUrl: 'https://login.microsoftonline.us/contoso%2Fx/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.us/contoso%2Fx/oauth2/v2.0/token',
    });
  });

  it('finds a cloud by its sign-in host and refuses unknown hosts', () => {
    expect(microsoftCloud('login.microsoftonline.us')).toBe(microsoftClouds.usGovernment);
    expect(() => microsoftCloud('login.example.com')).toThrow('unsupported');
  });

  it("reads the account from the cloud's /me with the new token", async () => {
    const fetch = stubMe({ id: 'u1', displayName: 'Dana', mail: 'dana@acme.us' });
    const account = await microsoftOAuth({ cloud: 'usGovernment' }).account({
      tokens: { access_token: 'token' },
      client: undefined,
      req,
    });

    expect(account).toEqual({ id: 'u1', label: 'Dana', email: 'dana@acme.us' });
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://graph.microsoft.us/v1.0/me');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: 'Bearer token' },
      redirect: 'error',
      signal,
    });
  });

  it('falls back to the user principal name, and needs one of them', async () => {
    stubMe({ id: 'u1', mail: null, userPrincipalName: 'dana@acme.com' });

    await expect(
      microsoftOAuth().account({ tokens: { access_token: 't' }, client: undefined, req }),
    ).resolves.toEqual({ id: 'u1', label: 'dana@acme.com', email: 'dana@acme.com' });

    stubMe({ id: 'u1' });

    await expect(
      microsoftOAuth().account({ tokens: { access_token: 't' }, client: undefined, req }),
    ).rejects.toThrow('did not return an account email');
  });

  it('fails a lookup Graph refuses', async () => {
    stubMe({ error: { code: 'InvalidAuthenticationToken' } }, 401);

    await expect(
      microsoftOAuth().account({ tokens: { access_token: 't' }, client: undefined, req }),
    ).rejects.toThrow('Microsoft account lookup failed (401)');
  });
});
