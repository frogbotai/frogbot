import type { CallCredentialVia } from '@frogbotai/gateway';
import { GatewayError } from '@frogbotai/gateway/errors';

import type { ChatGPTAuth } from '../config.js';
import { RESOURCE, USAGE_URL } from './constants.js';
import { chatgptFetch } from './fetch.js';

const NO_API_ACCESS =
  "A ChatGPT plan can't be used through this app's API. Paste an OpenAI API key in Settings → Linked accounts to use the API.";

/**
 * Provider settings for a call on a ChatGPT plan: the token as the key, OpenAI's API pinned as
 * OpenCode does, and the compressing `fetch`. Refuses calls through the app's HTTP API, which
 * OpenAI's terms don't allow on a plan.
 */
export function chatgptCredential({
  auth,
  via,
}: {
  auth: ChatGPTAuth;
  via: CallCredentialVia;
}): Record<string, unknown> {
  if (via === 'http') {
    throw new GatewayError({ message: NO_API_ACCESS, status: 403, code: 'credential_unavailable' });
  }

  return { apiKey: auth.apiKey, baseURL: RESOURCE, fetch: chatgptFetch };
}

export const chatgptNotice = {
  text: 'Using ChatGPT plan',
  link: { label: 'Manage usage', url: USAGE_URL },
};
