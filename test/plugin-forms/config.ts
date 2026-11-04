import { formsPlugin } from '@frogbotai/plugin-forms';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { Leads, leadsSlug, staffFormSlug, Users } from './shared.js';

export default buildTestConfig({
  collections: [Users, Leads],
  plugins: [
    formsPlugin({
      collections: [leadsSlug],
      access: {
        read: ({ req }) => (req.user ? true : { slug: { not_equals: staffFormSlug } }),
      },
    }),
  ],
});
