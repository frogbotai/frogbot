import { serve } from '@hono/node-server';

/**
 * A test-only OAuth token endpoint. Each authorization `code` gets its own access token,
 * `fresh-<code>`, so a piece whose `account()` reads the token links one provider account per
 * code. A few codes fail on purpose: `provider-error`, `malformed`, and `replacement` (no refresh
 * token or expiry), `no-scope` and `empty-scope` (scope variants).
 */
export async function startFakeProvider() {
  const exchanges: URLSearchParams[] = [];
  let server!: ReturnType<typeof serve>;

  const url = await new Promise<string>((resolve) => {
    server = serve(
      {
        port: 0,
        hostname: '127.0.0.1',
        fetch: async (req) => {
          const params = new URLSearchParams(await req.text());
          exchanges.push(params);
          const code = params.get('code');
          if (code === 'provider-error') {
            return Response.json({ error: 'private-provider-error' }, { status: 400 });
          }

          if (code === 'malformed') return Response.json({ access_token: '' });

          return Response.json({
            access_token: `fresh-${code}`,
            ...(code === 'replacement'
              ? {}
              : { refresh_token: 'private-refresh-token', expires_in: 3600 }),
            ...(code === 'no-scope'
              ? {}
              : { scope: code === 'empty-scope' ? '' : 'read write read' }),
          });
        },
      },
      (address) => resolve(`http://127.0.0.1:${address.port}`),
    );
  });

  return {
    url,
    exchanges,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
