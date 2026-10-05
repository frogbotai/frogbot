import type { CollectionConfig } from '../../../collections/config/types.js';

export const AUTONUMBERS_SLUG = 'frogbot-autonumbers';

export function defaultAutonumbersCollection(): CollectionConfig {
  return {
    slug: AUTONUMBERS_SLUG,
    typescript: { interface: 'FrogBotAutonumber' },
    admin: { hidden: true },
    graphQL: false,
    access: {
      create: () => false,
      read: () => false,
      update: () => false,
      delete: () => false,
    },
    fields: [
      { name: 'key', type: 'text', required: true, unique: true },
      { name: 'value', type: 'number', required: true },
    ],
  };
}
