import { z } from 'zod';

/** A pasted OpenAI API key. */
export const openaiAuth = z.object({
  apiKey: z.string().trim().startsWith('sk-').meta({ secret: true, title: 'API key' }),
});

/** A ChatGPT sign-in: the plan's access token, sent as the bearer key, and its issued client ID. */
export const chatgptAuth = z.object({
  apiKey: z.string().min(1),
  chatgpt: z.object({ clientId: z.string().min(1) }),
});

export type OpenAIKeyAuth = z.output<typeof openaiAuth>;

export type ChatGPTAuth = z.output<typeof chatgptAuth>;

export type OpenAIAuth = OpenAIKeyAuth | ChatGPTAuth;

/** True when the account runs on a ChatGPT plan rather than a pasted key. */
export function isChatGPT(auth: OpenAIAuth): auth is ChatGPTAuth {
  return 'chatgpt' in auth;
}
