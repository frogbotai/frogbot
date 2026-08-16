import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

export type StubOAuthRequests = {
  authorize: URLSearchParams[];
  token: Record<string, string>[];
  account: Array<string | undefined>;
  revoke: Record<string, string>[];
};

export type StubOAuthProvider = {
  url: string;
  requests: StubOAuthRequests;
  close: () => Promise<void>;
};

export const stubOAuthAccount = {
  id: 'account-1',
  email: 'oauth-user@example.com',
  name: 'OAuth User',
};

export const stubOAuthTokens = {
  access: 'access-token-1',
  refresh: 'refresh-token-1',
  refreshed: 'access-token-2',
};

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function readForm(
  req: Parameters<Parameters<typeof createServer>[0]>[0],
): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
}

/**
 * Minimal authorization-code + PKCE OAuth provider used by the OAuth e2e
 * suite. Records every inbound request so specs can assert the exact wire
 * traffic FrogBot produced, and rejects exchanges whose PKCE verifier does
 * not match the challenge sent at authorize time.
 */
export async function startStubOAuthProvider(): Promise<StubOAuthProvider> {
  const requests: StubOAuthRequests = { authorize: [], token: [], account: [], revoke: [] };
  const challenges = new Map<string, string>();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://provider.invalid');

    if (req.method === 'GET' && url.pathname === '/authorize') {
      requests.authorize.push(url.searchParams);
      const state = url.searchParams.get('state') ?? '';
      const challenge = url.searchParams.get('code_challenge') ?? '';
      challenges.set(state, challenge);
      const redirect = new URL(url.searchParams.get('redirect_uri') ?? '');
      redirect.searchParams.set('code', `code-for-${state}`);
      redirect.searchParams.set('state', state);
      res.writeHead(302, { location: redirect.toString() }).end();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/token') {
      const body = await readForm(req);
      requests.token.push(body);
      if (body.grant_type === 'refresh_token') {
        if (body.refresh_token !== stubOAuthTokens.refresh) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: stubOAuthTokens.refreshed,
            expires_in: 3600,
            scope: 'profile',
            token_type: 'Bearer',
          }),
        );
        return;
      }
      const state = (body.code ?? '').replace('code-for-', '');
      if (challenges.get(state) !== pkceChallenge(body.code_verifier ?? '')) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: stubOAuthTokens.access,
          refresh_token: stubOAuthTokens.refresh,
          expires_in: 3600,
          scope: 'profile',
          token_type: 'Bearer',
        }),
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/userinfo') {
      requests.account.push(req.headers.authorization);
      if (!req.headers.authorization?.startsWith('Bearer ')) {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(stubOAuthAccount));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/revoke') {
      requests.revoke.push(await readForm(req));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Stub OAuth provider did not bind');

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
