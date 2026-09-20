import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

import { Pages } from './collections/pages';
import { Users } from './collections/users';
import { pagesSlug, serverURL } from './shared';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || '' },
  }),
  collections: [Users, Pages],
  typescript: { autoGenerate: false },
  admin: {
    livePreview: {
      url: ({ data, req }) => (req.frogbot ? `${serverURL}/pages/${data.slug}` : null),
      collections: [pagesSlug],
      breakpoints: [{ label: 'Mobile', name: 'mobile', width: 375, height: 667 }],
    },
  },
});
