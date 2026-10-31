import { definePiece, type PieceDefinition } from 'frogbot/pieces';

import { chatgptSignIn } from './chatgpt/index.js';
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
 * OpenAI as a linked account. List it in `connections` with `secret: true`, so each user can
 * paste their own API key in Settings → Linked accounts, and `oauth: true`, so they can choose
 * "Continue with ChatGPT" and run on their ChatGPT plan. Their AI calls run on that account.
 */
export const createOpenAI = definePiece({
  slug: 'openai',
  label: 'OpenAI',
  admin: {
    description: 'Run AI on your own OpenAI API key or ChatGPT plan',
    group: 'AI',
    icon: openaiIcon,
  },
  auth: openaiAuth,
  oauth: chatgptSignIn,
  client: ({ auth }) => auth,
  provider: {
    name: 'openai',
    billingUrl: 'https://platform.openai.com/settings/organization/billing',
    credential: ({ auth }) => ({ apiKey: auth.apiKey }),
    models: ({ auth, signal }) => listOpenAIModels({ apiKey: auth.apiKey, signal }),
  },
  actions: [],
} satisfies PieceDefinition<OpenAITypes, OpenAIAuth>);

export {
  type ChatGPTAuth,
  chatgptAuth,
  isChatGPT,
  type OpenAIAuth,
  openaiAuth,
  type OpenAIKeyAuth,
} from './config.js';
export { listOpenAIModels, OpenAIRequestError } from './models.js';
