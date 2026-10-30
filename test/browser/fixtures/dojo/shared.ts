export const notesSlug = 'notes';
export const usersSlug = 'users';
export const chatsSlug = 'chats';
export const messagesSlug = 'messages';
export const agentSlug = 'helper';

/** What Dojo's image build sets: the platform plugin, but not `DOJO=1` (Dojo's `build/recipe.ts`). */
export const dojoBuildEnv = { FROGBOT_PLATFORM_PLUGIN: '@frogbotai/plugin-dojo' };

/** What `dojo()` reads at runtime. Dummy values: the spec seeds chats directly and uploads nothing. */
export const dojoEnv = {
  ...dojoBuildEnv,
  DOJO: '1',
  DOJO_R2_ENDPOINT: 'http://127.0.0.1:9/r2',
  DOJO_R2_BUCKET: 'browser-dojo',
  DOJO_R2_ACCESS_KEY_ID: 'browser-dojo-key',
  DOJO_R2_SECRET_ACCESS_KEY: 'browser-dojo-secret',
  DOJO_AI_API_KEY: 'browser-dojo-ai-key',
  DOJO_AI_BASE_URL: 'http://127.0.0.1:9/v1',
  DOJO_JOBS_SECRET: 'browser-dojo-jobs-secret',
  DOJO_OAUTH_CLIENT_ID: '1',
  DOJO_OAUTH_CLIENT_SECRET: 'browser-oauth-secret',
  DOJO_URL: 'http://127.0.0.1:9',
};
