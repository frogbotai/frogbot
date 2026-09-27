import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

import { Posts } from '../../collections/Posts';
import { Users } from '../../collections/Users';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || 'skill-sample-secret',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:skill.db' } }),
  collections: [Users, Posts],
  admin: {
    components: {
      beforeNavLinks: ['/__skill-samples__/advanced/advanced#Welcome'],
      views: {
        reports: {
          Component: '/__skill-samples__/advanced/advanced#ReportsView',
          path: '/reports',
          exact: true,
        },
      },
    },
  },
});
