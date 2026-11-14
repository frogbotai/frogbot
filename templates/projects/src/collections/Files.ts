import type { CollectionConfig } from 'frogbot';

import { sharedAccess } from '../roles';

export const Files: CollectionConfig = {
  slug: 'files',
  access: sharedAccess,
  admin: { icon: 'file' },
  file: true,
  fields: [],
};
