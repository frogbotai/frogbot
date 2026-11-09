import { twoFactor } from '@frogbotai/plugin-two-factor';
import { serve } from '@hono/node-server';
import { definePiece } from 'frogbot';
import { z } from 'zod';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';

export const usersSlug = 'users';

export const methodSlug = 'work';

export const policy = { requireAdmins: true };

let closeProvider: () => Promise<void> = () => Promise.resolve();

export const stopProvider = () => closeProvider();

const providerURL = await new Promise<string>((resolve) => {
  const server = serve(
    {
      port: 0,
      hostname: '127.0.0.1',
      fetch: async (req) =>
        Response.json({
          access_token: `fresh:${new URLSearchParams(await req.text()).get('code')}`,
          expires_in: 3600,
        }),
    },
    (address) => resolve(`http://127.0.0.1:${address.port}`),
  );

  closeProvider = () =>
    new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())));
});

const method = definePiece({
  slug: 'identity',
  label: 'Identity',
  auth: z.object({ access_token: z.string() }),
  client: ({ auth }: { auth: unknown }) => auth,
  oauth: {
    authorizationUrl: `${providerURL}/authorize`,
    tokenUrl: `${providerURL}/token`,
    scopes: { catalog: { email: 'email' }, defaults: ['email'] },
    pkce: true,
    toAuth: ({ tokens }) => ({ access_token: tokens.access_token }),
    account: ({ tokens }) =>
      Promise.resolve({
        id: 'account',
        label: 'Account',
        email: (tokens.access_token ?? '').slice('fresh:'.length),
      }),
  },
  actions: [],
})({ slug: methodSlug, oauth: { clientId: 'client', clientSecret: 'secret' } });

export default await buildTestConfig({
  admin: { user: usersSlug },
  collections: [
    {
      slug: usersSlug,
      access: {
        create: () => true,
        read: ({ req }) => Boolean(req.user),
        update: ({ req }) => Boolean(req.user),
      },
      auth: { signIn: [method] },
      fields: [
        { name: 'role', type: 'text' },
        { name: 'noTwoFactor', type: 'checkbox' },
      ],
    },
  ],
  connections: [{ piece: method, oauth: true }],
  plugins: [
    twoFactor({
      issuer: 'Acme',
      require: ({ user }) => policy.requireAdmins && user.role === 'admin',
      canEnable: ({ user }) => user.noTwoFactor !== true,
      canReset: ({ req }) => (req.user as { role?: string } | null)?.role === 'admin',
    }),
  ],
});
