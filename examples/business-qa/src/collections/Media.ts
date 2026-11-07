import type { CollectionConfig, FrogBotRequest } from 'frogbot';

const authenticated = ({ req }: { req: FrogBotRequest }) => Boolean(req.user);

export const Media: CollectionConfig = {
  slug: 'media',
  admin: { icon: 'image' },
  file: true,
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  fields: [{ name: 'alt', type: 'text' }],
  upload: { staticDir: 'media' },
};
