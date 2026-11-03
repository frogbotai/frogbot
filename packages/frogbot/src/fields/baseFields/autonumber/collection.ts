import type { CollectionConfig } from '../../../collections/config/types.js';

export const AUTONUMBERS_SLUG = 'frogbot-autonumbers';

export function defaultAutonumbersCollection(): CollectionConfig {
  return {
    slug: AUTONUMBERS_SLUG,
    versions: false,
    authorship: false,
    custom: { frogbot: { internal: true } },
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

export const AUTONUMBER_KEYS_SLUG = 'frogbot-autonumber-keys';

/** Keys a record held before a move or a prefix rename, so the old key still finds it. */
export function defaultAutonumberKeysCollection(): CollectionConfig {
  return {
    slug: AUTONUMBER_KEYS_SLUG,
    versions: false,
    authorship: false,
    custom: { frogbot: { internal: true } },
    typescript: { interface: 'FrogBotAutonumberKey' },
    admin: { hidden: true },
    graphQL: false,
    access: {
      create: () => false,
      read: () => false,
      update: () => false,
      delete: () => false,
    },
    indexes: [{ fields: ['collection', 'key'] }],
    fields: [
      { name: 'collection', type: 'text', required: true },
      { name: 'path', type: 'text', required: true },
      { name: 'key', type: 'text', required: true },
      { name: 'record', type: 'text', required: true },
    ],
  };
}
