import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig, definePiece } from 'frogbot';
import { z } from 'zod';

import { firstUserEmail, signInOnly } from '../shared';

const port = process.env.PORT || 3000;
const serverURL = `http://localhost:${port}`;

const crossOriginProviderURL = `http://127.0.0.1:${port}/api/browser`;

const stub = definePiece({
  slug: 'stub',
  label: 'Stub',
  auth: z.object({ access_token: z.string() }),
  client: ({ auth }: { auth: unknown }) => auth,
  oauth: {
    authorizationUrl: `${crossOriginProviderURL}/authorize`,
    tokenUrl: `${crossOriginProviderURL}/token`,
    scopes: { catalog: { email: 'email' }, defaults: ['email'] },
    pkce: true,
    toAuth: ({ tokens }) => ({ access_token: tokens.access_token }),
    account: ({ tokens }) =>
      Promise.resolve({
        id: 'stub-account',
        label: 'Stub account',
        email: (tokens.access_token ?? '').slice('fresh:'.length),
      }),
  },
  actions: [],
})({ oauth: { clientId: 'browser-client', clientSecret: 'browser-client-secret' } });

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || 'browser-sign-in-secret',
  serverURL,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./frogbot.db' } }),
  typescript: { autoGenerate: false },
  admin: { importMap: { autoGenerate: false } },
  collections: [
    {
      slug: 'users',
      auth: {
        signIn: [stub],
        ...(process.env.SIGN_IN_SETUP === signInOnly
          ? { disableLocalStrategy: { enableFields: true as const } }
          : {}),
      },
      fields: [],
    },
  ],
  endpoints: [
    {
      path: '/browser/authorize',
      method: 'get',
      handler: (req) => {
        const params = new URL(req.url!).searchParams;
        const callback = new URL(params.get('redirect_uri')!);

        callback.searchParams.set('state', params.get('state')!);
        callback.searchParams.set('code', firstUserEmail);

        return Response.redirect(callback, 302);
      },
    },
    {
      path: '/browser/token',
      method: 'post',
      handler: async (req) => {
        const params = new URLSearchParams(await req.text!());

        return Response.json({ access_token: `fresh:${params.get('code')}` });
      },
    },
  ],
});
