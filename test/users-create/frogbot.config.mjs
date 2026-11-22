import { postgresAdapter } from '@frogbotai/db-postgres';
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

const url = process.env.USERS_CREATE_DATABASE_URL;
const scenario = process.env.USERS_CREATE_SCENARIO;

if (!url) throw new Error('USERS_CREATE_DATABASE_URL is required');

export default buildConfig({
  secret: 'frogbot-users-create-isolated-test-secret',
  db: url.startsWith('postgres')
    ? postgresAdapter({ pool: { connectionString: url } })
    : sqliteAdapter({ client: { url } }),
  typescript: { autoGenerate: false },
  admin: { importMap: { autoGenerate: false } },
  collections: [
    {
      slug: 'users',
      auth:
        scenario === 'verify'
          ? { verify: true }
          : scenario === 'no-local'
            ? { disableLocalStrategy: { enableFields: true } }
            : true,
      trash: true,
      fields: scenario === 'name' ? [{ name: 'name', type: 'text', required: true }] : [],
    },
    { slug: 'notes', fields: [{ name: 'title', type: 'text' }] },
  ],
});
