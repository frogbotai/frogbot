import { formatNames } from 'payload';

import { CHAT_ASSETS_SLUG } from '../../packages/frogbot/src/chat/collections/assets.js';
import { CHAT_TURNS_SLUG } from '../../packages/frogbot/src/chat/collections/turns.js';
import { WAITPOINTS_SLUG } from '../../packages/frogbot/src/jobs/waitpoints/collection.js';
import { TRIGGER_SUBSCRIPTIONS_SLUG } from '../../packages/frogbot/src/triggers/collection.js';

export const usersSlug = 'users';
export const postsSlug = 'posts';
export const chatsSlug = 'chats';
export const requestContextSlug = 'request-context';
export const allowedOrigin = 'http://allowed.test';
export const disallowedOrigin = 'http://disallowed.test';

export const hiddenTypeNames = [
  ...[CHAT_TURNS_SLUG, CHAT_ASSETS_SLUG, TRIGGER_SUBSCRIPTIONS_SLUG, WAITPOINTS_SLUG].map(
    (slug) => formatNames(slug).singular,
  ),
  'PayloadKv',
  'PayloadJob',
  'PayloadLockedDocument',
  'PayloadPreference',
  'PayloadJobsStat',
];
