import type { CollectionConfig } from '../../collections/config/types.js';

export const WAITPOINTS_SLUG = 'frogbot-waitpoints';

export function defaultWaitpointsCollection(): CollectionConfig {
  return {
    slug: WAITPOINTS_SLUG,
    admin: { hidden: true },
    graphQL: false,
    access: {
      create: () => false,
      read: () => false,
      update: () => false,
      delete: () => false,
    },
    fields: [
      { name: 'jobId', type: 'text', required: true },
      { name: 'holder', type: 'relationship', relationTo: 'payload-jobs' },
      { name: 'name', type: 'text', required: true },
      { name: 'token', type: 'text', required: true, unique: true },
      { name: 'kind', type: 'select', options: ['delay', 'resumable'], required: true },
      { name: 'ready', type: 'checkbox', required: true, defaultValue: false },
      {
        name: 'status',
        type: 'select',
        options: ['pending', 'resumed', 'expired'],
        required: true,
        defaultValue: 'pending',
      },
      { name: 'expiresAt', type: 'date', index: true },
      { name: 'until', type: 'date' },
      { name: 'data', type: 'json' },
      { name: 'dispatched', type: 'checkbox', required: true, defaultValue: false },
      { name: 'dispatchOwner', type: 'text' },
      { name: 'dispatchLeaseUntil', type: 'date' },
    ],
    indexes: [
      { fields: ['jobId', 'name'], unique: true },
      { fields: ['ready', 'dispatched', 'status'] },
    ],
  };
}
