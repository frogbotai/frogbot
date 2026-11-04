import os from 'node:os';
import path from 'node:path';

import { formsPlugin } from '@frogbotai/plugin-forms';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import {
  Leads,
  leadsSlug,
  staffFormSlug,
  ticketFiles,
  ticketFilesSlug,
  Tickets,
  ticketsSlug,
  Users,
  viewerName,
} from './shared.js';

export default buildTestConfig({
  collections: [
    Users,
    Leads,
    Tickets,
    ticketFiles({ staticDir: path.join(os.tmpdir(), 'frogbot-plugin-forms-int') }),
  ],
  plugins: [
    formsPlugin({
      collections: [leadsSlug, ticketsSlug, ticketFilesSlug],
      access: {
        read: ({ req }) => (req.user ? true : { slug: { not_equals: staffFormSlug } }),
        create: ({ req }) => Boolean(req.user) && req.user?.name !== viewerName,
        update: ({ req }) => Boolean(req.user) && req.user?.name !== viewerName,
      },
    }),
  ],
});
