import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';
import { definePiece } from 'frogbot/pieces';
import { z } from 'zod';

const google = definePiece({
  slug: 'google',
  label: 'Google',
  auth: z.object({ access_token: z.string() }),
  client: ({ auth }) => auth,
  oauth: {
    authorizationUrl: `${process.env.SMOKE_PROVIDER_URL}/authorize`,
    tokenUrl: `${process.env.SMOKE_PROVIDER_URL}/token`,
    scopes: ['openid', 'email'],
    toAuth: ({ tokens }) => ({ access_token: tokens.access_token }),
    account: async () => ({
      id: 'local-user',
      label: 'Local fixture',
      email: 'connections-ui@example.test',
    }),
  },
  actions: [],
})({ oauth: { clientId: 'local-client', clientSecret: 'local-secret' } });

const fixture = definePiece({
  slug: 'local-fixture',
  label: 'Local Fixture',
  auth: z.object({
    apiKey: z.string().min(1),
    region: z.enum(['east', 'west']),
    retries: z.number().int().min(0),
    enabled: z.boolean(),
  }),
  client: ({ auth }) => auth,
  actions: [],
})();

export default buildConfig({
  secret: 'connections-ui-local-fixture-secret',
  serverURL: process.env.SMOKE_SERVER_URL,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  admin: { user: 'users', importMap: { autoGenerate: false } },
  typescript: { autoGenerate: false },
  collections: [{ slug: 'users', auth: { signIn: [google] }, fields: [] }],
  connections: [
    { piece: google, oauth: true },
    { piece: fixture, secret: true },
  ],
});
