import type { CollectionConfig, FrogbotRequest } from 'frogbot';

const authenticated = ({ req }: { req: FrogbotRequest }) => Boolean(req.user);

export const Media: CollectionConfig = {
  slug: 'media',
  access: { create: authenticated, delete: authenticated, read: authenticated, update: authenticated },
  fields: [{ name: 'alt', type: 'text' }],
  upload: { staticDir: 'media' },
};
