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
        scenario === 'verify' || scenario === 'verify-block'
          ? { verify: true }
          : scenario === 'no-local'
            ? { disableLocalStrategy: { enableFields: true } }
            : scenario === 'lock'
              ? { maxLoginAttempts: 2, lockTime: 600_000 }
              : scenario === 'no-sessions'
                ? { useSessions: false }
                : true,
      trash: true,
      hooks:
        scenario === 'verify-block'
          ? {
              beforeLogin: [
                () => {
                  throw new Error('account disabled');
                },
              ],
            }
          : {},
      fields: scenario === 'name' ? [{ name: 'name', type: 'text', required: true }] : [],
    },
    { slug: 'notes', fields: [{ name: 'title', type: 'text' }] },
  ],
});
