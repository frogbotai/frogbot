import { definePiece, type PieceDefinition } from 'frogbot/pieces';

import { type OpenAIAuth, openaiAuth } from './config.js';
import { openaiIcon } from './icon.js';
import { listOpenAIModels } from './models.js';

type OpenAITypes = {
  auth: OpenAIAuth;
  options: Record<string, never>;
  actions: Record<string, never>;
  triggers: Record<string, never>;
};

/**
 * OpenAI as a linked account. List it in `connections` with `secret: true`: each user pastes
 * their own API key in Settings → Linked accounts, and their AI calls run and bill on it.
 */
export const createOpenAI = definePiece({
  slug: 'openai',
  label: 'OpenAI',
  admin: {
    description: 'Run AI on your own OpenAI API key',
    group: 'AI',
    icon: openaiIcon,
  },
  auth: openaiAuth,
  client: ({ auth }) => openaiAuth.parse(auth),
  provider: {
    name: 'openai',
    billingUrl: 'https://platform.openai.com/settings/organization/billing',
    credential: ({ auth }) => ({ apiKey: auth.apiKey }),
    models: ({ auth, signal }) => listOpenAIModels({ apiKey: auth.apiKey, signal }),
  },
  actions: [],
} satisfies PieceDefinition<OpenAITypes, OpenAIAuth>);

export { type OpenAIAuth, openaiAuth } from './config.js';
export { listOpenAIModels, OpenAIRequestError } from './models.js';
