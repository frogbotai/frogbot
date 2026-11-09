import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';

export const usersSlug = 'users';
export const notesSlug = 'notes';
export const agentSlug = 'assistant';
export const model = 'openai/gpt-5.4-mini';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [],
};

const Notes: CollectionConfig = {
  slug: notesSlug,
  access: openAccess,
  fields: [{ name: 'title', type: 'text' }],
};

export default await buildTestConfig({
  collections: [Users, Notes],
  ai: { defaultModel: model, providers: { openai: true } },
  agents: [{ slug: agentSlug, model, instructions: 'Help the user.', access: () => true }],
});
