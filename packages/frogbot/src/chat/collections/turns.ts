import type { CollectionConfig } from '../../collections/config/types.js';

export const CHAT_TURNS_SLUG = 'frogbot-chat-turns';

export function defaultChatTurnsCollection(): CollectionConfig {
  return {
    slug: CHAT_TURNS_SLUG,
    admin: { hidden: true },
    access: {
      create: () => false,
      read: () => false,
      update: () => false,
      delete: () => false,
    },
    fields: [
      { name: 'id', type: 'text', required: true },
      {
        name: 'state',
        type: 'select',
        options: ['idle', 'running', 'awaiting'],
        required: true,
        defaultValue: 'idle',
      },
      { name: 'attempt', type: 'text' },
      { name: 'leaseUntil', type: 'date' },
    ],
  };
}
