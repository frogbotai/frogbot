import { twoFactor } from '@frogbotai/plugin-two-factor';
import { serve } from '@hono/node-server';
import { type CollectionBeforeSignInHook, definePiece, finishSignIn } from 'frogbot';
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

type Tenanted = { tenant?: string | null } | null;

const sameTenant = ({ req }: { req: { user: unknown } }) => {
  const tenant = (req.user as Tenanted)?.tenant;
  if (!req.user) return false;

  return tenant ? { tenant: { equals: tenant } } : true;
};

const termsKey = (id: string) => `terms:${id}`;

const termsHook: CollectionBeforeSignInHook = async ({ req, user, method, returnTo }) => {
  if (user.terms !== true) return;

  const id = crypto.randomUUID();
  await req.frogbot.kv.set(termsKey(id), { userId: user.id, method, returnTo }, { ttl: 60_000 });

  return new Response(null, { status: 303, headers: { location: `/terms?id=${id}` } });
};

export default await buildTestConfig({
  admin: { user: usersSlug },
  collections: [
    {
      slug: usersSlug,
      access: {
        create: () => true,
        read: sameTenant,
        update: sameTenant,
      },
      auth: { signIn: [method] },
      hooks: { beforeSignIn: [termsHook] },
      endpoints: [
        {
          path: '/terms/accept',
          method: 'post',
          handler: async (req) => {
            const key = termsKey(req.searchParams.get('id') ?? '');
            const paused = (await req.frogbot.kv.get(key)) as {
              userId: string | number;
              method: string;
              returnTo: string;
            } | null;

            if (!paused) return new Response(null, { status: 400 });

            await req.frogbot.kv.delete(key);

            return finishSignIn({ req, collectionSlug: usersSlug, ...paused });
          },
        },
      ],
      fields: [
        { name: 'role', type: 'text' },
        { name: 'tenant', type: 'text' },
        { name: 'terms', type: 'checkbox' },
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
      canReset: ({ req, user }) =>
        (req.user as { role?: string } | null)?.role === 'admin' && user?.role !== 'owner',
    }),
  ],
});
