import { afterEach, describe, expect, it, vi } from 'vitest';

import { discoverOidc } from '../../../../../packages/frogbot/src/connections/oauth/discovery.js';

const serve = (issuer: string, endpoints: Record<string, string>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          userinfo_endpoint: `${issuer}/userinfo`,
          ...endpoints,
        }),
      ),
    ),
  );

describe('discoverOidc', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint'])(
    'refuses an http %s from an https issuer',
    async (endpoint) => {
      const issuer = `https://downgrade-${endpoint}.example.com`;
      serve(issuer, { [endpoint]: `http://downgrade.example.com/${endpoint}` });

      await expect(discoverOidc(issuer)).rejects.toMatchObject({ code: 'oauth.configuration' });
    },
  );

  it('accepts https endpoints from an https issuer', async () => {
    const issuer = 'https://ok.example.com';
    serve(issuer, {});

    await expect(discoverOidc(issuer)).resolves.toMatchObject({
      token_endpoint: `${issuer}/token`,
    });
  });

  it('accepts http endpoints from an http issuer', async () => {
    const issuer = 'http://127.0.0.1:9999';
    serve(issuer, {});

    await expect(discoverOidc(issuer)).resolves.toMatchObject({
      authorization_endpoint: `${issuer}/authorize`,
    });
  });
});
