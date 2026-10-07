import { expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { buildProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { describeLive } from '../live/live.js';

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY ?? '';

const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const MODEL = 'zen/deepseek-v4.1-flash';

const TEST_TIMEOUT = 90_000;

function makeZenApp() {
  const registry = buildProviderRegistry({
    zen: { baseURL: ZEN_BASE_URL, apiKey: OPENCODE_API_KEY },
  });

  return createApp({ registry });
}

const QUESTION = 'What is 17*23? Reply with just the number.';
const EXPECTED = '391';

type ChatBody = {
  object?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
};

type MessagesBody = {
  type?: string;
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type ResponsesBody = {
  object?: string;
  status?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

describeLive(
  'gateway E2E — cross-route fidelity (same question, three wires)',
  { keys: ['OPENCODE_API_KEY'] },
  () => {
    const app = makeZenApp();

    it(
      "the same arithmetic question returns 200 + correct answer in each route's own envelope",
      async () => {
        const [chat, messages, responses] = await Promise.all([
          postJson<ChatBody>(app, '/v1/chat/completions', {
            model: MODEL,
            messages: [{ role: 'user', content: QUESTION }],
            max_tokens: 1024,
          }),
          postJson<MessagesBody>(app, '/v1/messages', {
            model: MODEL,
            messages: [{ role: 'user', content: QUESTION }],
            max_tokens: 1024,
          }),
          postJson<ResponsesBody>(app, '/v1/responses', {
            model: MODEL,
            input: QUESTION,
            max_output_tokens: 1024,
          }),
        ]);

        expect(chat.status, `chat body: ${JSON.stringify(chat.body)}`).toBe(200);
        expect(messages.status, `messages body: ${JSON.stringify(messages.body)}`).toBe(200);
        expect(responses.status, `responses body: ${JSON.stringify(responses.body)}`).toBe(200);

        expect(chat.body.object).toBe('chat.completion');

        const chatText = chat.body.choices?.[0]?.message?.content ?? '';

        expect(typeof chatText).toBe('string');

        expect(messages.body.type).toBe('message');
        expect(messages.body.role).toBe('assistant');
        expect(Array.isArray(messages.body.content)).toBe(true);

        const messagesText = (messages.body.content ?? [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('');

        expect(responses.body.object).toBe('response');
        expect(responses.body.status).toBe('completed');
        expect(typeof responses.body.output_text).toBe('string');

        const responsesText = responses.body.output_text ?? '';

        expect(chat.body.object).not.toBe(responses.body.object);
        expect((messages.body as { object?: string }).object).toBeUndefined();

        expect(chatText).toContain(EXPECTED);
        expect(messagesText).toContain(EXPECTED);
        expect(responsesText).toContain(EXPECTED);
      },
      TEST_TIMEOUT,
    );
  },
);
