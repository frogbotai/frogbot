import type { CollectionConfig } from '../collections/config/types.js';

export const TRIGGER_SUBSCRIPTIONS_SLUG = 'trigger-subscriptions';

export function defaultTriggerSubscriptionsCollection(): CollectionConfig {
  return {
    slug: TRIGGER_SUBSCRIPTIONS_SLUG,
    admin: { hidden: true },
    access: { create: () => false, read: () => false, update: () => false, delete: () => false },
    fields: [
      { name: 'agent', type: 'text', required: true },
      { name: 'piece', type: 'text', required: true },
      { name: 'instance', type: 'text', required: true, index: true },
      { name: 'trigger', type: 'text', required: true },
      { name: 'inputHash', type: 'text', required: true },
      { name: 'input', type: 'json', required: true },
      { name: 'state', type: 'json' },
      { name: 'webhookUrl', type: 'text' },
      { name: 'status', type: 'select', options: ['active', 'error'], required: true },
      { name: 'cleanupPending', type: 'checkbox', defaultValue: false },
      { name: 'enablePending', type: 'checkbox', defaultValue: false },
      { name: 'enableAttempt', type: 'text' },
      { name: 'expiresAt', type: 'date' },
    ],
    indexes: [{ fields: ['instance'] }, { fields: ['agent', 'instance', 'trigger'], unique: true }],
  };
}
