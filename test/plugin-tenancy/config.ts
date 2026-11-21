import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { inTenants, myTenants, tenancyPlugin } from '@frogbotai/plugin-tenancy';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';

export default await buildTestConfig({
  ...(getCurrentDatabaseAdapter() === 'sqlite' && {
    db: sqliteAdapter({
      client: { url: `file:${join(mkdtempSync(join(tmpdir(), 'tenancy-')), 'app.db')}` },
      transactionOptions: {},
    }),
  }),
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [
        { name: 'name', type: 'text' },
        { name: 'robot', type: 'checkbox' },
      ],
    },
    {
      slug: 'notes',
      access: {
        read: inTenants('team'),
        update: inTenants('team', { role: 'editor' }),
        delete: inTenants('team', { role: 'admin' }),
        create: async ({ req, data }) =>
          (await myTenants(req)).editable.some((id) => String(id) === String(data?.team)),
      },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'team', type: 'relationship', relationTo: 'teams', required: true },
      ],
    },
  ],
  plugins: [
    tenancyPlugin({
      tenantsSlug: 'teams',
      membersSlug: 'teamMembers',
      tenantField: 'team',
      tenants: {
        fields: [{ name: 'motto', type: 'text' }],
        hooks: {
          beforeChange: [({ data }) => ({ ...data, motto: data.motto ?? 'Onward' })],
        },
      },
      isSuperUser: (req) => req.user?.email === 'root@example.com',
      personalTenant: { skip: (user) => user.robot === true },
    }),
  ],
});
