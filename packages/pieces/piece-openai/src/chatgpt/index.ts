import type { OAuthTokens, PieceOAuthSignIn } from 'frogbot/pieces';

import { type ChatGPTAuth, chatgptAuth } from '../config.js';
import { PLAN_SCOPE } from './constants.js';
import { authorizeChatGPT } from './signIn.js';
import { refreshTokens, revokeRefreshToken } from './tokens.js';

function stored(tokens: OAuthTokens): { refreshToken: string; clientId: string } {
  const { refresh_token: refreshToken, client_id: clientId } = tokens;

  if (typeof refreshToken !== 'string' || typeof clientId !== 'string' || !clientId) {
    throw new Error('This ChatGPT account has no refresh token or client ID. Reconnect it.');
  }

  return { refreshToken, clientId };
}

/** "Continue with ChatGPT": OpenAI's sign-in for running AI on the user's ChatGPT plan. */
export const chatgptSignIn = {
  label: 'ChatGPT',
  scopes: { catalog: { plan: PLAN_SCOPE }, defaults: [], required: ['plan'] },
  auth: chatgptAuth,
  toAuth: ({ tokens }) => ({
    apiKey: tokens.access_token ?? '',
    chatgpt: { clientId: typeof tokens.client_id === 'string' ? tokens.client_id : '' },
  }),
  authorize: authorizeChatGPT,
  refresh: async ({ tokens }) => ({ ...(await refreshTokens(stored(tokens))) }) as OAuthTokens,
  revoke: ({ tokens }) => revokeRefreshToken(stored(tokens)),
} satisfies PieceOAuthSignIn<ChatGPTAuth, 'plan'>;
