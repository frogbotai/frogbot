/** OpenAI's sign-in for ChatGPT plan use, as OpenCode and OpenAI's open-source guide set it up. */
export const ISSUER = 'https://auth.openai.com';
export const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
export const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
export const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
export const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;

/** The API base a plan token is sent to, and the `resource` it is issued for. */
export const RESOURCE = 'https://api.openai.com/v1';

/** The first sign-in registers a client for the user; the callback returns its issued ID. */
export const REGISTRATION_CLIENT_ID = 'dynamic_agent_client';
export const AGENT_NAME = 'FrogBot';

export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
export const SCOPE = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;

export const USAGE_URL = 'https://chatgpt.com/settings/usage';

/** This install's `ext_agent_host_id`, made once. */
export const HOST_KEY = 'openai:chatgpt:host';

/** The issued client ID of a user's registration, kept across Disconnect. */
export function clientKey(user: { collection: string; id: number | string }): string {
  return `openai:chatgpt:client:${user.collection}:${user.id}`;
}
