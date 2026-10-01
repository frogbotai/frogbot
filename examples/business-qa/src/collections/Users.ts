import type { CollectionConfig } from 'frogbot';

import { google } from '../pieces';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: { signIn: google ? [google] : [] },
  admin: { useAsTitle: 'name' },
  fields: [{ name: 'name', type: 'text' }],
};
