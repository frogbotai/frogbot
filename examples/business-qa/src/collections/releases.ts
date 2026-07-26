import type { CollectionConfig, FrogbotRequest } from 'frogbot';

const authenticated = ({ req }: { req: FrogbotRequest }) => Boolean(req.user);

export const Releases: CollectionConfig = {
  slug: 'releases',
  admin: { defaultColumns: ['name', 'version', 'status', 'targetDate'], useAsTitle: 'name' },
  access: { create: authenticated, delete: authenticated, read: authenticated, update: authenticated },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'version', type: 'text', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'planning',
      options: ['planning', 'qa', 'ready', 'released', 'blocked'],
    },
    { name: 'targetDate', type: 'date', required: true },
    { name: 'owner', type: 'relationship', relationTo: 'users', required: true },
    { name: 'summary', type: 'textarea', required: true },
    { name: 'acceptanceCriteria', type: 'textarea' },
    { name: 'releaseNotes', type: 'textarea' },
    { name: 'artifacts', type: 'relationship', relationTo: 'media', hasMany: true },
  ],
};
